import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (!process.env.DATABASE_URL) {
  const port = 54329;
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
    // data directory already initialised
  }
  await pg.start();
  try {
    await pg.createDatabase("campus_test");
  } catch {
    // database already exists
  }
  process.env.DATABASE_URL = `postgres://postgres:${password}@127.0.0.1:${port}/campus_test`;
}

process.env.NODE_ENV = "test";
process.env.PASSWORD_PEPPER = "change-me";
process.env.MAIL_MODE = "console";
process.env.UPLOAD_DIR = path.join(root, "uploads-test");

const { default: knex } = await import("knex");
const { default: config } = await import("../../knexfile.js");
const migrator = knex(config.test);
await migrator.migrate.latest();
await migrator.destroy();
