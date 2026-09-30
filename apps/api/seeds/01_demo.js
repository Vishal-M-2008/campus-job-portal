import argon2 from "argon2";
import { randomUUID } from "node:crypto";

const password = "password-is-not-real";

export async function seed(knex) {
  await knex.raw("truncate table ai_jobs, invoices, consents, documents, saved_jobs, alumni_referrals, offers, interviews, application_notes, applications, jobs, drives, student_profiles, placement_policies, subscription_entitlements, feature_flags, company_users, companies, password_resets, sessions, user_roles, users, college_domains, colleges restart identity cascade");
  const pepper = process.env.PASSWORD_PEPPER ?? "change-me";
  const passwordHash = await argon2.hash(pepper + password);
  const collegeId = "11111111-1111-4111-8111-111111111111";
  const superId = "22222222-2222-4222-8222-222222222222";
  const tpoId = "33333333-3333-4333-8333-333333333333";
  const studentId = "44444444-4444-4444-8444-444444444444";
  const facultyId = "55555555-5555-4555-8555-555555555555";
  const companyAdminId = "66666666-6666-4666-8666-666666666666";
  const companyId = "77777777-7777-4777-8777-777777777777";
  await knex("colleges").insert({ id: collegeId, name: "SRM Institute of Science and Technology", slug: "srm", timezone: "Asia/Kolkata", academic_year: "2026" });
  await knex("college_domains").insert({ id: randomUUID(), tenant_id: collegeId, domain: "srm.edu" });
  await knex("placement_policies").insert({ tenant_id: collegeId, min_cgpa: null, require_faculty_signoff: false, offer_freeze: false, allow_alumni_referrals: true });
  await knex("subscription_entitlements").insert({ id: randomUUID(), tenant_id: collegeId, plan: "free", seat_limit: null });
  for (const key of ["ai", "analytics", "extra_seats", "branding"]) {
    await knex("feature_flags").insert({ tenant_id: collegeId, key, enabled: true });
  }
  await knex("users").insert([
    { id: superId, tenant_id: null, email: "admin@platform.local", name: "Platform Admin", password_hash: passwordHash },
    { id: tpoId, tenant_id: collegeId, email: "tpo@srm.edu", name: "Placement Admin", password_hash: passwordHash },
    { id: studentId, tenant_id: collegeId, email: "student@srm.edu", name: "Asha Student", password_hash: passwordHash },
    { id: facultyId, tenant_id: collegeId, email: "faculty@srm.edu", name: "Faculty Mentor", password_hash: passwordHash },
    { id: companyAdminId, tenant_id: collegeId, email: "admin@northwind.test", name: "Company Admin", password_hash: passwordHash },
  ]);
  await knex("user_roles").insert([
    { id: randomUUID(), user_id: superId, tenant_id: null, role: "superadmin" },
    { id: randomUUID(), user_id: tpoId, tenant_id: collegeId, role: "tpo" },
    { id: randomUUID(), user_id: studentId, tenant_id: collegeId, role: "student" },
    { id: randomUUID(), user_id: facultyId, tenant_id: collegeId, role: "faculty" },
    { id: randomUUID(), user_id: companyAdminId, tenant_id: collegeId, role: "company_admin" },
  ]);
  await knex("student_profiles").insert({ user_id: studentId, tenant_id: collegeId, department: "CSE", batch: "2026", cgpa: 8.2, backlogs: 0, mentor_user_id: facultyId, skills: JSON.stringify(["JavaScript"]) });
  await knex("companies").insert({ id: companyId, tenant_id: collegeId, name: "Northwind", website: "https://example.com", approved: true });
  await knex("company_users").insert({ id: randomUUID(), tenant_id: collegeId, company_id: companyId, user_id: companyAdminId, company_role: "admin" });
}
