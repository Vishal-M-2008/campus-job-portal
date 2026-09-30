export async function up(knex) {
  await knex.schema.createTable("invoices", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.string("provider").notNullable();
    table.integer("amount_cents").notNullable().defaultTo(0);
    table.string("currency").notNullable().defaultTo("INR");
    table.string("status").notNullable().defaultTo("hook_only");
    table.string("external_id").nullable();
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("ai_jobs", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.string("kind").notNullable();
    table.string("status").notNullable().defaultTo("queued");
    table.jsonb("input").nullable();
    table.jsonb("output").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["tenant_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("ai_jobs");
  await knex.schema.dropTableIfExists("invoices");
}
