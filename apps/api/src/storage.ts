import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ObjectStorage = {
  put(key: string, body: Buffer): Promise<string>;
};

export function createStorage(): ObjectStorage {
  if (process.env.STORAGE_MODE === "azure") {
    return {
      async put(key: string) {
        if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
          throw Object.assign(new Error("storage_not_configured"), { code: "storage_not_configured" });
        }
        return `azure://${process.env.AZURE_BLOB_CONTAINER ?? "uploads"}/${key}`;
      },
    };
  }
  const root = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  return {
    async put(key: string, body: Buffer) {
      const full = path.join(root, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return full;
    },
  };
}

export function fileKey(original: string) {
  const safe = original.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${randomUUID()}-${safe}`;
}
