import { FEATURE_FLAGS, ROLES, type Role } from "@campus/shared";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { db } from "./db.js";
import { hashPassword } from "./security.js";

export type ImportRow = { email?: string; name?: string; role?: string; department?: string; batch?: string };

export async function importUsers(tenantId: string, rows: ImportRow[]) {
  const errors: { line: number; message: string }[] = [];
  let created = 0;
  let updated = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 1;
    const email = row.email?.trim().toLowerCase();
    const role = row.role?.trim() as Role | undefined;
    if (!email || !row.name || !role || !ROLES.includes(role) || role === "superadmin") {
      errors.push({ line, message: "invalid_row" });
      continue;
    }
    const existing = await db("users").where({ tenant_id: tenantId, email }).first();
    if (existing) {
      await db("users").where({ id: existing.id }).update({ name: row.name });
      const hasRole = await db("user_roles").where({ user_id: existing.id, role }).first();
      if (!hasRole) {
        await db("user_roles").insert({ id: randomUUID(), user_id: existing.id, tenant_id: tenantId, role });
      }
      updated += 1;
    } else {
      const id = randomUUID();
      await db("users").insert({
        id,
        tenant_id: tenantId,
        email,
        name: row.name,
        password_hash: await hashPassword("password-is-not-real"),
      });
      await db("user_roles").insert({ id: randomUUID(), user_id: id, tenant_id: tenantId, role });
      if (role === "student") {
        await db("student_profiles").insert({
          user_id: id,
          tenant_id: tenantId,
          department: row.department ?? null,
          batch: row.batch ?? null,
        });
      }
      created += 1;
    }
  }
  return { created, updated, errors };
}

export function rowsFromCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift()?.split(",").map((cell) => cell.trim()) ?? [];
  return lines.map((line) => {
    const cells = line.split(",");
    const row: ImportRow = {};
    header.forEach((key, index) => {
      (row as Record<string, string>)[key] = cells[index]?.trim() ?? "";
    });
    return row;
  });
}

export function rowsFromXlsx(buffer: Buffer): ImportRow[] {
  const book = XLSX.read(buffer, { type: "buffer" });
  const sheet = book.Sheets[book.SheetNames[0]];
  return XLSX.utils.sheet_to_json<ImportRow>(sheet);
}

export async function ensureFlags(tenantId: string) {
  for (const key of FEATURE_FLAGS) {
    await db("feature_flags").insert({ tenant_id: tenantId, key, enabled: true }).onConflict(["tenant_id", "key"]).ignore();
  }
}
