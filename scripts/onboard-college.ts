import { readFileSync } from "node:fs";
import { db } from "../apps/api/src/db.ts";
import { importUsers, rowsFromCsv, rowsFromXlsx } from "../apps/api/src/importUsers.ts";

const tenantId = process.argv[2];
const file = process.argv[3];
if (!tenantId || !file) {
  console.error("Usage: tsx scripts/onboard-college.ts <tenant-id> <users.csv|json|xlsx>");
  process.exit(1);
}
const lower = file.toLowerCase();
const buffer = readFileSync(file);
const rows = lower.endsWith(".json")
  ? JSON.parse(buffer.toString("utf8"))
  : lower.endsWith(".csv")
    ? rowsFromCsv(buffer.toString("utf8"))
    : rowsFromXlsx(buffer);
const result = await importUsers(tenantId, rows);
console.log(JSON.stringify({ created: result.created, updated: result.updated, errors: result.errors }));
await db.destroy();
