import { FEATURE_FLAGS, OPEN_APPLICATION_STATUSES, evaluateApply, passwordSchema, themeSchema } from "@campus/shared";
import { z } from "zod";
import { Router } from "express";
import multer from "multer";
import { createCheckout, parseResumeText } from "./adapters.js";
import { db } from "./db.js";
import { ensureFlags, importUsers, rowsFromCsv, rowsFromXlsx } from "./importUsers.js";
import { sendMail } from "./mailer.js";
import { enqueue } from "./queue.js";
import { audit, cookieBase, dummyVerify, hashPassword, newToken, randomUUID, requireRole, requireTenant, requireUser, sha256, verifyPassword } from "./security.js";
import { createStorage, fileKey } from "./storage.js";
import { idParam } from "./types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const storage = createStorage();

async function policyFor(tenantId: string) {
  const row = await db("placement_policies").where({ tenant_id: tenantId }).first();
  return {
    max_open_applications: row?.max_open_applications ?? null,
    min_cgpa: row?.min_cgpa == null ? null : Number(row.min_cgpa),
    max_backlogs: row?.max_backlogs ?? null,
    departments: row?.departments ?? null,
    batches: row?.batches ?? null,
    require_faculty_signoff: Boolean(row?.require_faculty_signoff),
    offer_freeze: Boolean(row?.offer_freeze),
    allow_alumni_referrals: row?.allow_alumni_referrals !== false,
  };
}

export const api = Router();

api.get("/health", async (_req, res) => {
  await db.raw("select 1 as ok");
  res.json({ ok: true });
});

api.post("/auth/register", async (req, res) => {
  const body = z.object({
    tenantSlug: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
    password: passwordSchema,
  }).parse(req.body);
  const college = await db("colleges").where({ slug: body.tenantSlug }).first();
  if (!college) {
    res.status(404).json({ error: "college_not_found" });
    return;
  }
  const domains = await db("college_domains").where({ tenant_id: college.id });
  const domain = body.email.split("@")[1]?.toLowerCase();
  if (domains.length && !domains.some((row) => row.domain.toLowerCase() === domain)) {
    res.status(422).json({ error: "email_domain_rejected" });
    return;
  }
  const email = body.email.toLowerCase();
  const existing = await db("users").where({ tenant_id: college.id, email }).first();
  if (existing) {
    res.status(409).json({ error: "email_taken" });
    return;
  }
  const id = randomUUID();
  await db("users").insert({
    id,
    tenant_id: college.id,
    email,
    name: body.name,
    password_hash: await hashPassword(body.password),
  });
  await db("user_roles").insert({ id: randomUUID(), user_id: id, tenant_id: college.id, role: "student" });
  await db("student_profiles").insert({ user_id: id, tenant_id: college.id });
  await audit("auth.register", id, college.id, { email });
  res.status(201).json({ id, email });
});

api.post("/auth/login", async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    tenantSlug: z.string().min(1).optional(),
  }).parse(req.body);
  const email = body.email.toLowerCase();
  let user;
  if (body.tenantSlug) {
    const college = await db("colleges").where({ slug: body.tenantSlug }).first();
    user = college ? await db("users").where({ tenant_id: college.id, email }).first() : undefined;
  } else {
    user = await db("users").whereNull("tenant_id").where({ email }).first();
  }
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    res.status(423).json({ error: "account_locked" });
    return;
  }
  const ok = user ? await verifyPassword(user.password_hash, body.password) : false;
  if (!user) await dummyVerify(body.password);
  if (!user || !ok) {
    if (user) {
      const failed = user.failed_attempts + 1;
      await db("users").where({ id: user.id }).update({
        failed_attempts: failed,
        locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      });
      await audit("auth.login_failed", user.id, user.tenant_id, { email });
    }
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  await db("users").where({ id: user.id }).update({ failed_attempts: 0, locked_until: null });
  const token = newToken();
  const csrf = newToken();
  await db("sessions").insert({
    id: randomUUID(),
    user_id: user.id,
    token_hash: sha256(token),
    csrf_token: csrf,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 12),
  });
  const roles = await db("user_roles").where({ user_id: user.id });
  res.cookie("sid", token, { ...cookieBase(), httpOnly: true });
  res.cookie("csrf", csrf, { ...cookieBase(), httpOnly: false });
  await audit("auth.login", user.id, user.tenant_id, { email });
  res.json({ id: user.id, email: user.email, name: user.name, tenantId: user.tenant_id, roles: roles.map((row) => row.role) });
});

api.post("/auth/logout", requireUser, async (req, res) => {
  await db("sessions").where({ id: req.session!.id }).update({ revoked_at: db.fn.now() });
  res.clearCookie("sid", cookieBase());
  res.clearCookie("csrf", cookieBase());
  await audit("auth.logout", req.user!.id, req.tenantId ?? null, {});
  res.json({ ok: true });
});

api.get("/auth/me", requireUser, async (req, res) => {
  res.json({ id: req.user!.id, email: req.user!.email, name: req.user!.name, tenantId: req.tenantId, roles: req.roles });
});

api.post("/auth/forgot", async (req, res) => {
  const body = z.object({ email: z.string().email(), tenantSlug: z.string().optional() }).parse(req.body);
  const email = body.email.toLowerCase();
  const college = body.tenantSlug ? await db("colleges").where({ slug: body.tenantSlug }).first() : null;
  const user = college
    ? await db("users").where({ tenant_id: college.id, email }).first()
    : await db("users").where({ email }).first();
  if (user) {
    const token = newToken();
    await db("password_resets").insert({
      id: randomUUID(),
      user_id: user.id,
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 1000 * 60 * 30),
    });
    await sendMail({
      to: user.email,
      subject: "Reset your password",
      template: "password_reset",
      text: `Reset token ${token}`,
    });
  }
  res.json({ ok: true });
});

api.post("/auth/reset", async (req, res) => {
  const body = z.object({ token: z.string().min(10), password: passwordSchema }).parse(req.body);
  const row = await db("password_resets").where({ token_hash: sha256(body.token) }).whereNull("used_at").first();
  if (!row || new Date(row.expires_at) < new Date()) {
    res.status(400).json({ error: "reset_invalid" });
    return;
  }
  await db("users").where({ id: row.user_id }).update({ password_hash: await hashPassword(body.password), failed_attempts: 0, locked_until: null });
  await db("password_resets").where({ id: row.id }).update({ used_at: db.fn.now() });
  res.json({ ok: true });
});

api.get("/sessions", requireUser, async (req, res) => {
  const rows = await db("sessions").where({ user_id: req.user!.id }).whereNull("revoked_at").select("id", "created_at", "expires_at");
  res.json(rows);
});

api.delete("/sessions", requireUser, async (req, res) => {
  await db("sessions").where({ user_id: req.user!.id }).whereNull("revoked_at").update({ revoked_at: db.fn.now() });
  res.json({ ok: true });
});

api.post("/colleges", requireRole("superadmin"), async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    timezone: z.string().default("Asia/Kolkata"),
    academicYear: z.string().optional(),
    domains: z.array(z.string()).default([]),
  }).parse(req.body);
  const id = randomUUID();
  await db("colleges").insert({
    id,
    name: body.name,
    slug: body.slug,
    timezone: body.timezone,
    academic_year: body.academicYear ?? null,
    theme_json: null,
  });
  for (const domain of body.domains) {
    await db("college_domains").insert({ id: randomUUID(), tenant_id: id, domain: domain.toLowerCase() });
  }
  await db("placement_policies").insert({ tenant_id: id, require_faculty_signoff: false, offer_freeze: false, allow_alumni_referrals: true });
  await db("subscription_entitlements").insert({ id: randomUUID(), tenant_id: id, plan: "free", seat_limit: null });
  await ensureFlags(id);
  await audit("college.create", req.user!.id, id, { slug: body.slug });
  res.status(201).json({ id });
});

api.get("/colleges", requireRole("superadmin"), async (_req, res) => {
  res.json(await db("colleges").select("id", "name", "slug", "timezone", "academic_year", "theme_json"));
});

api.post("/colleges/:id/import", requireRole("superadmin"), async (req, res) => {
  const tenantId = idParam(req);
  const college = await db("colleges").where({ id: tenantId }).first();
  if (!college) {
    res.status(404).json({ error: "college_not_found" });
    return;
  }
  const body = z.object({
    format: z.enum(["csv", "json", "xlsx"]),
    text: z.string().optional(),
    base64: z.string().optional(),
  }).parse(req.body);
  let rows;
  if (body.format === "csv") rows = rowsFromCsv(body.text ?? "");
  else if (body.format === "json") rows = z.array(z.record(z.string())).parse(JSON.parse(body.text ?? "[]"));
  else rows = rowsFromXlsx(Buffer.from(body.base64 ?? "", "base64"));
  const result = await importUsers(tenantId, rows);
  await audit("college.import", req.user!.id, tenantId, { created: result.created, updated: result.updated, errorCount: result.errors.length });
  res.json(result);
});

api.patch("/colleges/:id/theme", requireRole("superadmin"), async (req, res) => {
  const theme = themeSchema.parse(req.body);
  const updated = await db("colleges").where({ id: idParam(req) }).update({ theme_json: theme });
  if (!updated) {
    res.status(404).json({ error: "college_not_found" });
    return;
  }
  res.json({ ok: true, theme });
});

api.get("/colleges/:id/export", requireRole("superadmin", "tpo"), async (req, res) => {
  const tenantId = req.roles?.includes("superadmin") ? idParam(req) : req.tenantId!;
  if (!req.roles?.includes("superadmin") && tenantId !== req.tenantId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const [users, jobs, applications] = await Promise.all([
    db("users").where({ tenant_id: tenantId }).select("id", "email", "name"),
    db("jobs").where({ tenant_id: tenantId }).select("id", "title", "status"),
    db("applications").where({ tenant_id: tenantId }).select("id", "job_id", "student_user_id", "status"),
  ]);
  res.json({ tenantId, users, jobs, applications });
});

api.get("/theme", requireUser, async (req, res) => {
  if (!req.tenantId) {
    res.json({ theme: null });
    return;
  }
  const college = await db("colleges").where({ id: req.tenantId }).first();
  res.json({ theme: college?.theme_json ?? null, name: college?.name });
});

api.get("/policy", requireRole("tpo", "superadmin"), requireTenant, async (req, res) => {
  res.json(await policyFor(req.tenantId!));
});

api.put("/policy", requireRole("tpo"), requireTenant, async (req, res) => {
  const body = z.object({
    max_open_applications: z.number().int().nullable(),
    min_cgpa: z.number().nullable(),
    max_backlogs: z.number().int().nullable(),
    departments: z.array(z.string()).nullable(),
    batches: z.array(z.string()).nullable(),
    require_faculty_signoff: z.boolean(),
    offer_freeze: z.boolean(),
    allow_alumni_referrals: z.boolean(),
  }).parse(req.body);
  await db("placement_policies").where({ tenant_id: req.tenantId }).update(body);
  res.json(body);
});

api.post("/companies", requireRole("company_admin", "tpo"), requireTenant, async (req, res) => {
  const body = z.object({ name: z.string().min(1), website: z.string().optional() }).parse(req.body);
  const id = randomUUID();
  await db("companies").insert({
    id,
    tenant_id: req.tenantId,
    name: body.name,
    website: body.website ?? null,
    approved: req.roles?.includes("tpo") ?? false,
  });
  if (req.roles?.includes("company_admin")) {
    await db("company_users").insert({ id: randomUUID(), tenant_id: req.tenantId, company_id: id, user_id: req.user!.id, company_role: "admin" });
  }
  res.status(201).json({ id });
});

api.get("/companies", requireUser, requireTenant, async (req, res) => {
  res.json(await db("companies").where({ tenant_id: req.tenantId }).select("id", "name", "website", "approved"));
});

api.post("/companies/:id/decision", requireRole("tpo"), requireTenant, async (req, res) => {
  const body = z.object({ approved: z.boolean() }).parse(req.body);
  const updated = await db("companies").where({ id: idParam(req), tenant_id: req.tenantId }).update({ approved: body.approved });
  if (!updated) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  res.json({ ok: true });
});

api.post("/companies/:id/recruiters", requireRole("company_admin"), requireTenant, async (req, res) => {
  const body = z.object({ email: z.string().email(), name: z.string().min(1), password: passwordSchema }).parse(req.body);
  const company = await db("companies").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  const member = await db("company_users").where({ company_id: company?.id, user_id: req.user!.id }).first();
  if (!company || !member) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  const id = randomUUID();
  await db("users").insert({
    id,
    tenant_id: req.tenantId,
    email: body.email.toLowerCase(),
    name: body.name,
    password_hash: await hashPassword(body.password),
  });
  await db("user_roles").insert({ id: randomUUID(), user_id: id, tenant_id: req.tenantId, role: "recruiter" });
  await db("company_users").insert({ id: randomUUID(), tenant_id: req.tenantId, company_id: company.id, user_id: id, company_role: "recruiter" });
  res.status(201).json({ id });
});

api.get("/profile", requireRole("student"), requireTenant, async (req, res) => {
  const profile = await db("student_profiles").where({ user_id: req.user!.id, tenant_id: req.tenantId }).first();
  const fields = ["department", "batch", "cgpa", "skills", "projects", "resume_path"];
  const filled = fields.filter((key) => profile?.[key] != null).length;
  res.json({ ...profile, completeness: Math.round((filled / fields.length) * 100) });
});

api.put("/profile", requireRole("student"), requireTenant, async (req, res) => {
  const body = z.object({
    phone: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    batch: z.string().nullable().optional(),
    cgpa: z.number().nullable().optional(),
    backlogs: z.number().int().nullable().optional(),
    graduationYear: z.number().int().nullable().optional(),
    education: z.array(z.record(z.string())).nullable().optional(),
    skills: z.array(z.string()).nullable().optional(),
    projects: z.array(z.record(z.string())).nullable().optional(),
    links: z.array(z.string()).nullable().optional(),
  }).parse(req.body);
  if (body.phone !== undefined) await db("users").where({ id: req.user!.id }).update({ phone: body.phone });
  await db("student_profiles").where({ user_id: req.user!.id, tenant_id: req.tenantId }).update({
    department: body.department,
    batch: body.batch,
    cgpa: body.cgpa,
    backlogs: body.backlogs,
    graduation_year: body.graduationYear,
    education: body.education ?? null,
    skills: body.skills ?? null,
    projects: body.projects ?? null,
    links: body.links ?? null,
  });
  res.json({ ok: true });
});

api.post("/profile/resume", requireRole("student"), requireTenant, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file || !/\.(pdf|doc|docx)$/i.test(file.originalname)) {
    res.status(422).json({ error: "resume_type_rejected" });
    return;
  }
  const key = fileKey(file.originalname);
  const saved = await storage.put(`${req.tenantId}/${key}`, file.buffer);
  await db("student_profiles").where({ user_id: req.user!.id, tenant_id: req.tenantId }).update({ resume_path: saved });
  res.json({ path: saved });
});

api.post("/profile/documents", requireRole("student"), requireTenant, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(422).json({ error: "file_required" });
    return;
  }
  const saved = await storage.put(`${req.tenantId}/${fileKey(req.file.originalname)}`, req.file.buffer);
  const id = randomUUID();
  await db("documents").insert({ id, tenant_id: req.tenantId, user_id: req.user!.id, kind: "marksheet", path: saved });
  res.status(201).json({ id, path: saved });
});

api.get("/jobs", requireUser, requireTenant, async (req, res) => {
  const q = String(req.query.q ?? "");
  let query = db("jobs").where({ tenant_id: req.tenantId });
  const companyUser = req.roles?.includes("recruiter") || req.roles?.includes("company_admin");
  if (companyUser) {
    const links = await db("company_users").where({ user_id: req.user!.id });
    const ids = links.map((row) => row.company_id);
    query = ids.length ? query.whereIn("company_id", ids) : query.whereRaw("1 = 0");
  } else if (req.roles?.includes("student")) {
    query = query.where({ status: "approved" });
  } else if (req.roles?.includes("alumni")) {
    query = query.where((builder) => {
      builder.where({ status: "approved" }).orWhere({ created_by: req.user!.id });
    });
  }
  if (q) query = query.whereILike("title", `%${q}%`);
  res.json(await query.select("id", "title", "location", "status", "company_id", "description"));
});

api.get("/jobs/:id", requireUser, requireTenant, async (req, res) => {
  const job = await db("jobs").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  const studentView = req.roles?.includes("student") || req.roles?.includes("alumni");
  if (!job || (studentView && job.status !== "approved")) {
    res.status(404).json({ error: "job_not_visible" });
    return;
  }
  res.json(job);
});

api.post("/jobs", requireRole("recruiter", "company_admin", "alumni"), requireTenant, async (req, res) => {
  const body = z.object({
    companyId: z.string().uuid().optional(),
    title: z.string().min(1),
    description: z.string().default(""),
    location: z.string().optional(),
    skills: z.array(z.string()).optional(),
  }).parse(req.body);
  let companyId = body.companyId;
  if (!req.roles?.includes("alumni")) {
    const link = await db("company_users").where({ user_id: req.user!.id, company_id: companyId }).first();
    if (!link) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  } else {
    const company = await db("companies").where({ tenant_id: req.tenantId, name: "Alumni openings" }).first();
    companyId = company?.id;
    if (!companyId) {
      companyId = randomUUID();
      await db("companies").insert({ id: companyId, tenant_id: req.tenantId, name: "Alumni openings", approved: true });
    }
  }
  const id = randomUUID();
  await db("jobs").insert({
    id,
    tenant_id: req.tenantId,
    company_id: companyId,
    title: body.title,
    description: body.description,
    location: body.location ?? null,
    skills: body.skills ?? [],
    status: "draft",
    created_by: req.user!.id,
  });
  res.status(201).json({ id });
});

api.post("/jobs/:id/submit", requireRole("recruiter", "company_admin", "alumni"), requireTenant, async (req, res) => {
  const updated = await db("jobs").where({ id: idParam(req), tenant_id: req.tenantId, created_by: req.user!.id }).whereIn("status", ["draft", "rejected"]).update({ status: "submitted" });
  if (!updated) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }
  res.json({ status: "submitted" });
});

api.post("/jobs/:id/decision", requireRole("tpo"), requireTenant, async (req, res) => {
  const body = z.object({ status: z.enum(["approved", "rejected"]) }).parse(req.body);
  const job = await db("jobs").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!job) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }
  await db("jobs").where({ id: job.id }).update({ status: body.status });
  const author = await db("users").where({ id: job.created_by }).first();
  if (author && body.status === "approved") {
    await sendMail({ to: author.email, subject: "Job approved", template: "job_approved", text: job.title });
  }
  res.json({ status: body.status });
});

api.post("/jobs/:id/clone", requireRole("recruiter", "company_admin"), requireTenant, async (req, res) => {
  const job = await db("jobs").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!job) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }
  const id = randomUUID();
  await db("jobs").insert({ ...job, id, status: "draft", created_by: req.user!.id, created_at: new Date() });
  res.status(201).json({ id });
});

api.post("/jobs/:id/save", requireRole("student"), requireTenant, async (req, res) => {
  const job = await db("jobs").where({ id: idParam(req), tenant_id: req.tenantId, status: "approved" }).first();
  if (!job) {
    res.status(404).json({ error: "job_not_visible" });
    return;
  }
  await db("saved_jobs").insert({ tenant_id: req.tenantId, user_id: req.user!.id, job_id: job.id }).onConflict(["user_id", "job_id"]).ignore();
  res.json({ ok: true });
});

api.post("/applications", requireRole("student"), requireTenant, async (req, res) => {
  const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
  const job = await db("jobs").where({ id: body.jobId, tenant_id: req.tenantId }).first();
  if (!job || job.status !== "approved") {
    res.status(404).json({ error: "job_not_visible" });
    return;
  }
  const profile = await db("student_profiles").where({ user_id: req.user!.id, tenant_id: req.tenantId }).first();
  const openApplications = await db("applications").where({ student_user_id: req.user!.id, tenant_id: req.tenantId }).whereIn("status", OPEN_APPLICATION_STATUSES).count<{ count: string }[]>("* as count");
  const accepted = await db("applications").where({ student_user_id: req.user!.id, tenant_id: req.tenantId, status: "offer_accepted" }).first();
  const decision = evaluateApply(await policyFor(req.tenantId!), {
    cgpa: profile?.cgpa == null ? null : Number(profile.cgpa),
    backlogs: profile?.backlogs ?? null,
    department: profile?.department ?? null,
    batch: profile?.batch ?? null,
    facultySignedOff: Boolean(profile?.faculty_signoff_at),
    openApplications: Number(openApplications[0]?.count ?? 0),
    hasAcceptedOffer: Boolean(accepted),
    forceUnlocked: Boolean(profile?.force_unlocked),
  });
  if (!decision.ok) {
    res.status(422).json({ error: "not_eligible", reason: decision.reason });
    return;
  }
  const id = randomUUID();
  await db("applications").insert({ id, tenant_id: req.tenantId, job_id: job.id, student_user_id: req.user!.id, status: "submitted" });
  await sendMail({ to: req.user!.email, subject: "Application received", template: "application_received", text: job.title });
  res.status(201).json({ id, status: "submitted" });
});

api.get("/applications", requireUser, requireTenant, async (req, res) => {
  let query = db("applications").where({ tenant_id: req.tenantId });
  if (req.roles?.includes("student")) query = query.where({ student_user_id: req.user!.id });
  if (req.roles?.includes("interview_panel")) {
    const slots = await db("interviews").where({ panel_user_id: req.user!.id });
    query = query.whereIn("id", slots.map((row) => row.application_id));
  }
  res.json(await query.select("id", "job_id", "student_user_id", "status", "reject_reason"));
});

api.post("/applications/:id/withdraw", requireRole("student"), requireTenant, async (req, res) => {
  const updated = await db("applications").where({ id: idParam(req), tenant_id: req.tenantId, student_user_id: req.user!.id }).update({ status: "withdrawn" });
  if (!updated) {
    res.status(404).json({ error: "application_not_found" });
    return;
  }
  res.json({ status: "withdrawn" });
});

api.post("/applications/bulk-status", requireRole("recruiter", "tpo"), requireTenant, async (req, res) => {
  const body = z.object({
    ids: z.array(z.string().uuid()).min(1),
    status: z.enum(["under_review", "shortlisted", "rejected"]),
    rejectReason: z.string().optional(),
  }).parse(req.body);
  await db("applications").where({ tenant_id: req.tenantId }).whereIn("id", body.ids).update({ status: body.status, reject_reason: body.rejectReason ?? null });
  res.json({ updated: body.ids.length });
});

api.post("/applications/:id/status", requireRole("recruiter", "tpo"), requireTenant, async (req, res) => {
  const body = z.object({ status: z.enum(["under_review", "shortlisted", "rejected"]), rejectReason: z.string().optional() }).parse(req.body);
  const application = await db("applications").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!application) {
    res.status(404).json({ error: "application_not_found" });
    return;
  }
  await db("applications").where({ id: application.id }).update({ status: body.status, reject_reason: body.rejectReason ?? null });
  const student = await db("users").where({ id: application.student_user_id }).first();
  if (student) await sendMail({ to: student.email, subject: "Application updated", template: "status_change", text: body.status });
  res.json({ status: body.status });
});

api.post("/applications/:id/notes", requireRole("recruiter", "faculty"), requireTenant, async (req, res) => {
  const body = z.object({ body: z.string().min(1), visibleToRecruiter: z.boolean().default(true) }).parse(req.body);
  const id = randomUUID();
  await db("application_notes").insert({
    id,
    tenant_id: req.tenantId,
    application_id: idParam(req),
    author_user_id: req.user!.id,
    body: body.body,
    visible_to_recruiter: body.visibleToRecruiter,
  });
  res.status(201).json({ id });
});

api.post("/applications/:id/interviews", requireRole("recruiter"), requireTenant, async (req, res) => {
  const body = z.object({
    startsAt: z.string(),
    location: z.string().optional(),
    meetingUrl: z.string().optional(),
    panelUserId: z.string().uuid().optional(),
  }).parse(req.body);
  const application = await db("applications").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!application) {
    res.status(404).json({ error: "application_not_found" });
    return;
  }
  const id = randomUUID();
  await db("interviews").insert({
    id,
    tenant_id: req.tenantId,
    application_id: application.id,
    starts_at: new Date(body.startsAt),
    location: body.location ?? null,
    meeting_url: body.meetingUrl ?? null,
    panel_user_id: body.panelUserId ?? null,
  });
  await db("applications").where({ id: application.id }).update({ status: "interview_scheduled" });
  const student = await db("users").where({ id: application.student_user_id }).first();
  if (student) await sendMail({ to: student.email, subject: "Interview scheduled", template: "interview_scheduled", text: body.startsAt });
  res.status(201).json({ id });
});

api.post("/interviews/:id/reschedule", requireRole("student"), requireTenant, async (req, res) => {
  const interview = await db("interviews").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!interview) {
    res.status(404).json({ error: "interview_not_found" });
    return;
  }
  await db("interviews").where({ id: interview.id }).update({ reschedule_requested_at: new Date() });
  await sendMail({ to: req.user!.email, subject: "Reschedule requested", template: "interview_reschedule", text: interview.id });
  res.json({ ok: true });
});

api.get("/faculty/mentees", requireRole("faculty"), requireTenant, async (req, res) => {
  const rows = await db("student_profiles").where({ tenant_id: req.tenantId, mentor_user_id: req.user!.id });
  res.json(rows);
});

api.post("/faculty/mentees/:id/signoff", requireRole("faculty"), requireTenant, async (req, res) => {
  const body = z.object({ note: z.string().optional() }).parse(req.body);
  const updated = await db("student_profiles").where({ user_id: idParam(req), tenant_id: req.tenantId, mentor_user_id: req.user!.id }).update({
    faculty_signoff_at: new Date(),
    faculty_note: body.note ?? null,
  });
  if (!updated) {
    res.status(404).json({ error: "mentee_not_found" });
    return;
  }
  res.json({ ok: true });
});

api.post("/students/:id/mentor", requireRole("tpo"), requireTenant, async (req, res) => {
  const body = z.object({ mentorUserId: z.string().uuid() }).parse(req.body);
  const updated = await db("student_profiles").where({ user_id: idParam(req), tenant_id: req.tenantId }).update({ mentor_user_id: body.mentorUserId });
  if (!updated) {
    res.status(404).json({ error: "student_not_found" });
    return;
  }
  res.json({ ok: true });
});

api.post("/students/:id/unlock", requireRole("superadmin", "tpo"), async (req, res) => {
  const tenantId = req.roles?.includes("superadmin") ? z.object({ tenantId: z.string().uuid() }).parse(req.body).tenantId : req.tenantId;
  const updated = await db("student_profiles").where({ user_id: idParam(req), tenant_id: tenantId }).update({ force_unlocked: true });
  if (!updated) {
    res.status(404).json({ error: "student_not_found" });
    return;
  }
  res.json({ ok: true });
});

api.get("/students", requireRole("tpo"), requireTenant, async (req, res) => {
  res.json(await db("student_profiles").where({ tenant_id: req.tenantId }));
});

api.post("/drives", requireRole("tpo"), requireTenant, async (req, res) => {
  const body = z.object({
    companyId: z.string().uuid(),
    title: z.string().min(1),
    venue: z.string().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    pptUrl: z.string().optional(),
  }).parse(req.body);
  const id = randomUUID();
  await db("drives").insert({
    id,
    tenant_id: req.tenantId,
    company_id: body.companyId,
    title: body.title,
    venue: body.venue ?? null,
    starts_at: body.startsAt ? new Date(body.startsAt) : null,
    ends_at: body.endsAt ? new Date(body.endsAt) : null,
    ppt_url: body.pptUrl ?? null,
  });
  res.status(201).json({ id });
});

api.get("/drives", requireUser, requireTenant, async (req, res) => {
  res.json(await db("drives").where({ tenant_id: req.tenantId }));
});

api.post("/applications/:id/offers", requireRole("recruiter", "tpo"), requireTenant, upload.single("file"), async (req, res) => {
  const body = z.object({ ctc: z.string().optional(), roleTitle: z.string().optional(), joiningDate: z.string().optional() }).parse(req.body);
  const application = await db("applications").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!application) {
    res.status(404).json({ error: "application_not_found" });
    return;
  }
  let pdfPath = null;
  if (req.file) pdfPath = await storage.put(`${req.tenantId}/${fileKey(req.file.originalname)}`, req.file.buffer);
  const id = randomUUID();
  await db("offers").insert({
    id,
    tenant_id: req.tenantId,
    application_id: application.id,
    ctc: body.ctc ?? null,
    role_title: body.roleTitle ?? null,
    joining_date: body.joiningDate ?? null,
    pdf_path: pdfPath,
    status: "extended",
  });
  await db("applications").where({ id: application.id }).update({ status: "offer_extended" });
  res.status(201).json({ id });
});

api.post("/offers/:id/decision", requireRole("student"), requireTenant, async (req, res) => {
  const body = z.object({ status: z.enum(["accepted", "declined"]) }).parse(req.body);
  const offer = await db("offers").where({ id: idParam(req), tenant_id: req.tenantId }).first();
  if (!offer) {
    res.status(404).json({ error: "offer_not_found" });
    return;
  }
  await db("offers").where({ id: offer.id }).update({ status: body.status });
  await db("applications").where({ id: offer.application_id }).update({ status: body.status === "accepted" ? "offer_accepted" : "offer_declined" });
  res.json({ status: body.status });
});

api.post("/referrals", requireRole("alumni"), requireTenant, async (req, res) => {
  const policy = await policyFor(req.tenantId!);
  if (!policy.allow_alumni_referrals) {
    res.status(422).json({ error: "referrals_disabled" });
    return;
  }
  const body = z.object({ studentUserId: z.string().uuid(), jobId: z.string().uuid().optional(), note: z.string().optional() }).parse(req.body);
  const id = randomUUID();
  await db("alumni_referrals").insert({
    id,
    tenant_id: req.tenantId,
    alumni_user_id: req.user!.id,
    student_user_id: body.studentUserId,
    job_id: body.jobId ?? null,
    note: body.note ?? null,
  });
  res.status(201).json({ id });
});

api.get("/analytics/summary", requireRole("tpo", "superadmin"), requireTenant, async (req, res) => {
  const flag = await db("feature_flags").where({ tenant_id: req.tenantId, key: "analytics" }).first();
  if (flag && flag.enabled === false) {
    res.status(402).json({ error: "feature_disabled" });
    return;
  }
  const applications = await db("applications").where({ tenant_id: req.tenantId }).select("status");
  const byStatus: Record<string, number> = {};
  for (const row of applications) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  const profiles = await db("student_profiles").where({ tenant_id: req.tenantId }).select("user_id", "department", "skills");
  const skills: Record<string, number> = {};
  const departments: Record<string, { students: number; placed: number }> = {};
  for (const profile of profiles) {
    const dept = profile.department ?? "unknown";
    departments[dept] = departments[dept] ?? { students: 0, placed: 0 };
    departments[dept].students += 1;
    const list = Array.isArray(profile.skills) ? profile.skills : [];
    for (const skill of list) skills[String(skill)] = (skills[String(skill)] ?? 0) + 1;
  }
  const placed = await db("applications").where({ tenant_id: req.tenantId, status: "offer_accepted" }).select("student_user_id");
  for (const row of placed) {
    const profile = profiles.find((item) => item.user_id === row.student_user_id);
    const dept = profile?.department ?? "unknown";
    if (departments[dept]) departments[dept].placed += 1;
  }
  const companies = await db("jobs").where({ tenant_id: req.tenantId }).select("company_id");
  res.json({ byStatus, skills, departments, jobCount: companies.length });
});

api.post("/ai/resume-parse", requireRole("student", "tpo"), requireTenant, async (req, res) => {
  const flag = await db("feature_flags").where({ tenant_id: req.tenantId, key: "ai" }).first();
  if (flag && flag.enabled === false) {
    res.status(402).json({ error: "feature_disabled" });
    return;
  }
  const body = z.object({ text: z.string().min(1) }).parse(req.body);
  const id = randomUUID();
  await db("ai_jobs").insert({ id, tenant_id: req.tenantId, kind: "resume_parse", status: "queued", input: { text: body.text.slice(0, 500) } });
  await enqueue("resume_parse", { id });
  const parsed = await parseResumeText(body.text);
  if (!parsed.configured) {
    await db("ai_jobs").where({ id }).update({ status: "adapter_not_configured" });
    res.status(503).json({ error: "adapter_not_configured", id });
    return;
  }
  await db("ai_jobs").where({ id }).update({ status: "done", output: JSON.stringify(parsed) });
  res.json({ id, parsed });
});

api.post("/billing/checkout", requireRole("superadmin"), async (req, res) => {
  const body = z.object({ provider: z.enum(["razorpay", "stripe"]), tenantId: z.string().uuid() }).parse(req.body);
  const checkout = createCheckout(body.provider, body.tenantId);
  await db("invoices").insert({
    id: randomUUID(),
    tenant_id: body.tenantId,
    provider: body.provider,
    amount_cents: 0,
    currency: body.provider === "stripe" ? "USD" : "INR",
    status: "hook_only",
  });
  res.json(checkout);
});

api.get("/flags", requireRole("superadmin", "tpo"), requireTenant, async (req, res) => {
  res.json(await db("feature_flags").where({ tenant_id: req.tenantId }));
});

api.put("/flags/:key", requireRole("superadmin"), async (req, res) => {
  const body = z.object({ tenantId: z.string().uuid(), enabled: z.boolean() }).parse(req.body);
  const key = idParam(req, "key");
  if (!FEATURE_FLAGS.includes(key as (typeof FEATURE_FLAGS)[number])) {
    res.status(404).json({ error: "flag_not_found" });
    return;
  }
  await db("feature_flags").where({ tenant_id: body.tenantId, key }).update({ enabled: body.enabled });
  res.json({ key, enabled: body.enabled });
});

api.post("/consents", requireUser, requireTenant, async (req, res) => {
  const body = z.object({ purpose: z.string().min(1) }).parse(req.body);
  const id = randomUUID();
  await db("consents").insert({ id, tenant_id: req.tenantId, user_id: req.user!.id, purpose: body.purpose });
  res.status(201).json({ id });
});
