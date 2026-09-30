import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  client: "pg",
  migrations: { directory: path.join(dir, "migrations") },
  seeds: { directory: path.join(dir, "seeds") },
  pool: { min: 0, max: 10 },
};

function make() {
  return { ...shared, connection: process.env.DATABASE_URL };
}

export default {
  get development() {
    return make();
  },
  get test() {
    return make();
  },
  get production() {
    return make();
  },
};
