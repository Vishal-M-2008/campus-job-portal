import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { openApi } from "./openapi.js";
import { api } from "./routes.js";
import { csrf, initAuth, loadSession } from "./security.js";

export async function createApp(options?: { loginMax?: number }) {
  await initAuth();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const id = req.get("x-request-id") ?? randomUUID();
    res.setHeader("x-request-id", id);
    req.headers["x-request-id"] = id;
    next();
  });
  app.use(pinoHttp({
    logger: pino({ level: process.env.NODE_ENV === "test" ? "silent" : "info" }),
    autoLogging: process.env.NODE_ENV !== "test",
  }));
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openApi));
  const loginLimit = rateLimit({ windowMs: 60_000, max: options?.loginMax ?? 30, standardHeaders: true });
  app.use("/api/v1/auth/login", loginLimit);
  app.use(loadSession);
  app.use(csrf);
  app.use("/api/v1", api);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "validation_failed" });
      return;
    }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "storage_not_configured") {
      res.status(503).json({ error: "storage_not_configured" });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  });
  return app;
}
