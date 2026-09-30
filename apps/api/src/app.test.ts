import { evaluateApply } from "@campus/shared";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, test } from "vitest";
import { createApp } from "./app.js";
import { db } from "./db.js";
import { hashPassword, randomUUID as uuid } from "./security.js";
import { sentMail } from "./mailer.js";

async function reset() {
  await db.raw("truncate table ai_jobs, invoices, consents, documents, saved_jobs, alumni_referrals, offers, interviews, application_notes, applications, jobs, drives, student_profiles, placement_policies, subscription_entitlements, feature_flags, company_users, companies, password_resets, sessions, user_roles, users, college_domains, colleges restart identity cascade");
  sentMail.length = 0;
}

beforeEach(reset);
afterAll(async () => {
  await db.destroy();
});

function csrfOf(response: request.Response) {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const raw = cookies.find((cookie) => cookie.startsWith("csrf="));
  return raw?.split(";")[0]?.slice("csrf=".length) ?? "";
}

async function platformAdmin() {
  const id = uuid();
  await db("users").insert({
    id,
    tenant_id: null,
    email: "admin@platform.local",
    name: "Platform Admin",
    password_hash: await hashPassword("password-is-not-real"),
  });
  await db("user_roles").insert({ id: uuid(), user_id: id, tenant_id: null, role: "superadmin" });
  return id;
}

test("health reports ok", async () => {
  const app = await createApp();
  const response = await request(app).get("/api/v1/health");
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
});

test("wrong password is rejected and the sixth attempt locks the account", async () => {
  const app = await createApp();
  await platformAdmin();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(app).post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "not-the-password" });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("invalid_credentials");
  }
  const locked = await request(app).post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "not-the-password" });
  expect(locked.status).toBe(423);
  expect(locked.body.error).toBe("account_locked");
});

test("login rate limit returns 429", async () => {
  const app = await createApp({ loginMax: 2 });
  await platformAdmin();
  await request(app).post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "nope-nope-nope" });
  await request(app).post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "nope-nope-nope" });
  const limited = await request(app).post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "nope-nope-nope" });
  expect(limited.status).toBe(429);
});

test("a student cannot read another college job", async () => {
  const app = await createApp();
  await platformAdmin();
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "password-is-not-real" });
  expect(login.status).toBe(200);
  const token = csrfOf(login);
  const collegeA = await agent.post("/api/v1/colleges").set("x-csrf-token", token).send({ name: "College A", slug: "college-a", domains: ["a.test"] });
  const collegeB = await agent.post("/api/v1/colleges").set("x-csrf-token", token).send({ name: "College B", slug: "college-b", domains: ["b.test"] });
  expect(collegeA.status).toBe(201);
  const importA = await agent.post(`/api/v1/colleges/${collegeA.body.id}/import`).set("x-csrf-token", token).send({
    format: "json",
    text: JSON.stringify([{ email: "student@a.test", name: "Student A", role: "student" }]),
  });
  expect(importA.body.created).toBe(1);
  const companyId = randomUUID();
  const jobId = randomUUID();
  await db("companies").insert({ id: companyId, tenant_id: collegeB.body.id, name: "B Co", approved: true });
  await db("jobs").insert({
    id: jobId,
    tenant_id: collegeB.body.id,
    company_id: companyId,
    title: "Secret role",
    description: "hidden",
    status: "approved",
    created_by: uuid(),
  });
  const student = request.agent(app);
  const studentLogin = await student.post("/api/v1/auth/login").send({ email: "student@a.test", password: "password-is-not-real", tenantSlug: "college-a" });
  expect(studentLogin.status).toBe(200);
  const hidden = await student.get(`/api/v1/jobs/${jobId}`).set("x-csrf-token", csrfOf(studentLogin));
  expect(hidden.status).toBe(404);
  expect(hidden.body.error).toBe("job_not_visible");
});

test("students do not see a job until the TPO approves it", async () => {
  const app = await createApp();
  await platformAdmin();
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "password-is-not-real" });
  const token = csrfOf(login);
  const college = await agent.post("/api/v1/colleges").set("x-csrf-token", token).send({ name: "Gate College", slug: "gate", domains: ["gate.test"] });
  await agent.post(`/api/v1/colleges/${college.body.id}/import`).set("x-csrf-token", token).send({
    format: "csv",
    text: "email,name,role\nstudent@gate.test,Student,student\nrecruiter@gate.test,Recruiter,recruiter\n",
  });
  const companyId = randomUUID();
  const recruiter = await db("users").where({ email: "recruiter@gate.test" }).first();
  await db("companies").insert({ id: companyId, tenant_id: college.body.id, name: "Gate Co", approved: true });
  await db("company_users").insert({ id: uuid(), tenant_id: college.body.id, company_id: companyId, user_id: recruiter.id, company_role: "recruiter" });
  await db("user_roles").insert({ id: uuid(), user_id: recruiter.id, tenant_id: college.body.id, role: "recruiter" }).onConflict(["user_id", "role"]).ignore();
  const recruiterAgent = request.agent(app);
  const recruiterLogin = await recruiterAgent.post("/api/v1/auth/login").send({ email: "recruiter@gate.test", password: "password-is-not-real", tenantSlug: "gate" });
  const recruiterToken = csrfOf(recruiterLogin);
  const job = await recruiterAgent.post("/api/v1/jobs").set("x-csrf-token", recruiterToken).send({ companyId, title: "Analyst", description: "Work" });
  expect(job.status).toBe(201);
  await recruiterAgent.post(`/api/v1/jobs/${job.body.id}/submit`).set("x-csrf-token", recruiterToken);
  const student = request.agent(app);
  const studentLogin = await student.post("/api/v1/auth/login").send({ email: "student@gate.test", password: "password-is-not-real", tenantSlug: "gate" });
  const studentToken = csrfOf(studentLogin);
  const hidden = await student.get(`/api/v1/jobs/${job.body.id}`).set("x-csrf-token", studentToken);
  expect(hidden.status).toBe(404);
  expect(hidden.body.error).toBe("job_not_visible");
});

test("apply is blocked when cgpa is below the college minimum", async () => {
  const app = await createApp();
  await platformAdmin();
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "password-is-not-real" });
  const token = csrfOf(login);
  const college = await agent.post("/api/v1/colleges").set("x-csrf-token", token).send({ name: "Policy College", slug: "policy", domains: ["policy.test"] });
  await agent.post(`/api/v1/colleges/${college.body.id}/import`).set("x-csrf-token", token).send({
    format: "json",
    text: JSON.stringify([{ email: "student@policy.test", name: "Low CGPA", role: "student" }]),
  });
  await db("placement_policies").where({ tenant_id: college.body.id }).update({ min_cgpa: 8 });
  const student = await db("users").where({ email: "student@policy.test" }).first();
  await db("student_profiles").where({ user_id: student.id }).update({ cgpa: 6.1, department: "CSE", batch: "2026" });
  const companyId = randomUUID();
  const jobId = randomUUID();
  await db("companies").insert({ id: companyId, tenant_id: college.body.id, name: "Policy Co", approved: true });
  await db("jobs").insert({ id: jobId, tenant_id: college.body.id, company_id: companyId, title: "Role", description: "", status: "approved", created_by: student.id });
  const studentAgent = request.agent(app);
  const studentLogin = await studentAgent.post("/api/v1/auth/login").send({ email: "student@policy.test", password: "password-is-not-real", tenantSlug: "policy" });
  const response = await studentAgent.post("/api/v1/applications").set("x-csrf-token", csrfOf(studentLogin)).send({ jobId });
  expect(response.status).toBe(422);
  expect(response.body.reason).toBe("cgpa_below_minimum");
  expect(sentMail.find((mail) => mail.template === "application_received")).toBeUndefined();
});

test("openapi lists the hiring paths", async () => {
  const app = await createApp();
  const response = await request(app).get("/api/v1/openapi.json");
  expect(response.status).toBe(200);
  expect(response.body.paths["/api/v1/auth/login"]).toBeTruthy();
  expect(response.body.paths["/api/v1/jobs"]).toBeTruthy();
  expect(response.body.paths["/api/v1/applications"]).toBeTruthy();
});

test("billing checkout does not charge and ai stays unconfigured without a key", async () => {
  const app = await createApp();
  await platformAdmin();
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({ email: "admin@platform.local", password: "password-is-not-real" });
  const token = csrfOf(login);
  const college = await agent.post("/api/v1/colleges").set("x-csrf-token", token).send({ name: "Paid College", slug: "paid", domains: ["paid.test"] });
  const checkout = await agent.post("/api/v1/billing/checkout").set("x-csrf-token", token).send({ provider: "razorpay", tenantId: college.body.id });
  expect(checkout.status).toBe(200);
  expect(checkout.body.charged).toBe(false);
  expect(checkout.body.status).toBe("hook_only");
  await agent.post(`/api/v1/colleges/${college.body.id}/import`).set("x-csrf-token", token).send({
    format: "json",
    text: JSON.stringify([{ email: "tpo@paid.test", name: "TPO", role: "tpo" }]),
  });
  const tpo = request.agent(app);
  const tpoLogin = await tpo.post("/api/v1/auth/login").send({ email: "tpo@paid.test", password: "password-is-not-real", tenantSlug: "paid" });
  const parsed = await tpo.post("/api/v1/ai/resume-parse").set("x-csrf-token", csrfOf(tpoLogin)).send({ text: "Student knows SQL" });
  expect(parsed.status).toBe(503);
  expect(parsed.body.error).toBe("adapter_not_configured");
});

test("policy helper reports the cgpa reason", () => {
  const result = evaluateApply({
    max_open_applications: null,
    min_cgpa: 8,
    max_backlogs: null,
    departments: null,
    batches: null,
    require_faculty_signoff: false,
    offer_freeze: false,
    allow_alumni_referrals: true,
  }, {
    cgpa: 7,
    backlogs: 0,
    department: "CSE",
    batch: "2026",
    facultySignedOff: true,
    openApplications: 0,
    hasAcceptedOffer: false,
    forceUnlocked: false,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe("cgpa_below_minimum");
});
