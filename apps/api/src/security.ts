import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db.js";

const pepper = () => process.env.PASSWORD_PEPPER ?? "change-me";

let dummyHash = "";

export async function initAuth() {
  dummyHash = await argon2.hash(pepper() + "not-a-user");
}

export async function hashPassword(password: string) {
  return argon2.hash(pepper() + password);
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, pepper() + password);
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function audit(action: string, actorUserId: string | null, tenantId: string | null, meta: Record<string, unknown>) {
  await db("audit_logs").insert({
    id: randomUUID(),
    action,
    actor_user_id: actorUserId,
    tenant_id: tenantId,
    meta,
  });
}

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.sid as string | undefined;
  if (!token) {
    next();
    return;
  }
  const session = await db("sessions")
    .where({ token_hash: sha256(token) })
    .whereNull("revoked_at")
    .first();
  if (!session || new Date(session.expires_at) < new Date()) {
    next();
    return;
  }
  const user = await db("users").where({ id: session.user_id }).first();
  if (!user) {
    next();
    return;
  }
  const roles = await db("user_roles").where({ user_id: user.id });
  req.user = user;
  req.roles = roles.map((row) => row.role as string);
  req.tenantId = user.tenant_id;
  req.session = session;
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!req.roles?.some((role) => roles.includes(role))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    res.status(403).json({ error: "tenant_required" });
    return;
  }
  next();
}

export function csrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const open = req.path.endsWith("/auth/login") || req.path.endsWith("/auth/register") || req.path.endsWith("/auth/forgot") || req.path.endsWith("/auth/reset");
  if (open) {
    next();
    return;
  }
  const header = req.get("x-csrf-token") ?? "";
  const cookie = (req.cookies?.csrf as string | undefined) ?? "";
  const sessionToken = req.session?.csrf_token ?? "";
  if (!header || !safeEqual(header, cookie) || !safeEqual(header, sessionToken)) {
    res.status(403).json({ error: "csrf_failed" });
    return;
  }
  next();
}

export function cookieBase() {
  return {
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  };
}

export async function dummyVerify(password: string) {
  await argon2.verify(dummyHash, pepper() + password);
}

export { randomUUID };
