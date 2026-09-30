export const openApi = {
  openapi: "3.0.3",
  info: { title: "Campus Job Portal", version: "0.1.0" },
  paths: {
    "/api/v1/health": { get: { summary: "Health" } },
    "/api/v1/auth/login": { post: { summary: "Login" } },
    "/api/v1/auth/register": { post: { summary: "Register student" } },
    "/api/v1/jobs": { get: { summary: "List jobs" }, post: { summary: "Create job" } },
    "/api/v1/applications": { get: { summary: "List applications" }, post: { summary: "Apply" } },
    "/api/v1/colleges": { get: { summary: "List colleges" }, post: { summary: "Create college" } },
    "/api/v1/analytics/summary": { get: { summary: "Analytics" } },
    "/api/v1/billing/checkout": { post: { summary: "Billing hook" } },
  },
};
