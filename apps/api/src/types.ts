import type { Request } from "express";

export type SessionUser = {
  id: string;
  tenant_id: string | null;
  email: string;
  name: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | string | null;
  phone: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      roles?: string[];
      tenantId?: string | null;
      session?: { id: string; csrf_token: string; user_id: string };
    }
  }
}

export function idParam(req: Request, name = "id") {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}
