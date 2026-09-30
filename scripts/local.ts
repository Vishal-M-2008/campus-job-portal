import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 5432;
const password = "change-me";
const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, ".pgdata"),
  user: "postgres",
  password,
  port,
  persistent: true,
});
try {
  await pg.initialise();
} catch {
  // already initialised
}
await pg.start();
try {
  await pg.createDatabase("campus");
} catch {
  // already exists
}
process.env.DATABASE_URL = `postgres://postgres:${password}@127.0.0.1:${port}/campus`;
process.env.PASSWORD_PEPPER = "change-me";
process.env.MAIL_MODE = "console";
process.env.NODE_ENV = "development";

const apiDir = path.join(root, "apps", "api");
await run("npx", ["knex", "migrate:latest"], apiDir);
await run("npx", ["knex", "seed:run"], apiDir);
const server = spawn("npx", ["tsx", "src/index.ts"], { cwd: apiDir, env: process.env, stdio: "inherit", shell: true });
process.on("SIGINT", async () => {
  server.kill();
  await pg.stop();
  process.exit(0);
});

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit", shell: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}
