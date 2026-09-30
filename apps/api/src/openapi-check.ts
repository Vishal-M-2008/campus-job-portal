import { openApi } from "./openapi.js";

const required = ["/api/v1/auth/login", "/api/v1/jobs", "/api/v1/applications"];
const missing = required.filter((path) => !(path in openApi.paths));
if (missing.length) {
  console.error(`OpenAPI missing ${missing.join(", ")}`);
  process.exit(1);
}
console.log("openapi ok");
