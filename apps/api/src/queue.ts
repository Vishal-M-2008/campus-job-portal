import { Queue } from "bullmq";
import { Redis } from "ioredis";

export async function enqueue(name: string, data: Record<string, string>) {
  if (!process.env.REDIS_URL) return { mode: "inline" as const };
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue("campus", { connection });
  await queue.add(name, data);
  await queue.close();
  await connection.quit();
  return { mode: "redis" as const };
}
