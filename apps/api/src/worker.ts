import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { parseResumeText } from "./adapters.js";
import { db } from "./db.js";

if (!process.env.REDIS_URL) {
  console.log("worker idle: REDIS_URL unset");
} else {
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker("campus", async (job) => {
    if (job.name !== "resume_parse") return;
    const row = await db("ai_jobs").where({ id: job.data.id }).first();
    if (!row) return;
    const text = String(row.input?.text ?? "");
    const parsed = await parseResumeText(text);
    await db("ai_jobs").where({ id: row.id }).update({ status: parsed.configured ? "done" : "adapter_not_configured", output: parsed });
  }, { connection });
  worker.on("failed", (job, error) => {
    console.error(`job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });
}
