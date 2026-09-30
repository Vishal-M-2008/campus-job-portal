import knex from "knex";
import config from "../knexfile.js";

const env = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";

export const db = knex(config[env]);
