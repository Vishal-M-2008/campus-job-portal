import { z } from "zod";

export const ROLES = [
  "student",
  "faculty",
  "tpo",
  "alumni",
  "superadmin",
  "company_admin",
  "recruiter",
  "interview_panel",
] as const;

export type Role = (typeof ROLES)[number];

export const JOB_STATUSES = ["draft", "submitted", "approved", "rejected", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "shortlisted",
  "interview_scheduled",
  "rejected",
  "offer_extended",
  "offer_accepted",
  "offer_declined",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const FEATURE_FLAGS = ["ai", "analytics", "extra_seats", "branding"] as const;

export const passwordSchema = z.string().min(12).max(200);

export const themeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoUrl: z.string().max(500).nullable().optional(),
});

export type Theme = z.infer<typeof themeSchema>;

export const DECK_THEME: Theme = {
  primary: "#c2410c",
  background: "#f6efe6",
  foreground: "#1c1410",
  logoUrl: null,
};

export type Policy = {
  max_open_applications: number | null;
  min_cgpa: number | null;
  max_backlogs: number | null;
  departments: string[] | null;
  batches: string[] | null;
  require_faculty_signoff: boolean;
  offer_freeze: boolean;
  allow_alumni_referrals: boolean;
};

export type ApplyFacts = {
  cgpa: number | null;
  backlogs: number | null;
  department: string | null;
  batch: string | null;
  facultySignedOff: boolean;
  openApplications: number;
  hasAcceptedOffer: boolean;
  forceUnlocked: boolean;
};

export function evaluateApply(policy: Policy, facts: ApplyFacts): { ok: true } | { ok: false; reason: string } {
  if (facts.forceUnlocked) return { ok: true };
  if (policy.offer_freeze && facts.hasAcceptedOffer) return { ok: false, reason: "offer_freeze" };
  if (policy.require_faculty_signoff && !facts.facultySignedOff) {
    return { ok: false, reason: "faculty_signoff_required" };
  }
  if (policy.max_open_applications != null && facts.openApplications >= policy.max_open_applications) {
    return { ok: false, reason: "max_open_applications" };
  }
  if (policy.min_cgpa != null && (facts.cgpa == null || facts.cgpa < policy.min_cgpa)) {
    return { ok: false, reason: "cgpa_below_minimum" };
  }
  if (policy.max_backlogs != null && (facts.backlogs == null || facts.backlogs > policy.max_backlogs)) {
    return { ok: false, reason: "backlog_limit" };
  }
  if (policy.departments?.length && !policy.departments.includes(facts.department ?? "")) {
    return { ok: false, reason: "department_not_eligible" };
  }
  if (policy.batches?.length && !policy.batches.includes(facts.batch ?? "")) {
    return { ok: false, reason: "batch_not_eligible" };
  }
  return { ok: true };
}

export const OPEN_APPLICATION_STATUSES: ApplicationStatus[] = [
  "submitted",
  "under_review",
  "shortlisted",
  "interview_scheduled",
  "offer_extended",
];
