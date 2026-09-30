import type { Knex } from "knex";

declare const config: Record<"development" | "test" | "production", Knex.Config>;
export default config;
