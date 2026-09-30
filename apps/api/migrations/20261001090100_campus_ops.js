export async function up(knex) {
  await knex.schema.createTable("drives", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("company_id").notNullable().references("id").inTable("companies");
    table.string("title").notNullable();
    table.string("venue").nullable();
    table.timestamp("starts_at").nullable();
    table.timestamp("ends_at").nullable();
    table.string("ppt_url").nullable();
    table.index(["tenant_id", "id"]);
  });

  await knex.schema.alterTable("jobs", (table) => {
    table.foreign("drive_id").references("id").inTable("drives");
  });

  await knex.schema.createTable("offers", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("application_id").notNullable().unique().references("id").inTable("applications");
    table.string("ctc").nullable();
    table.string("role_title").nullable();
    table.date("joining_date").nullable();
    table.string("pdf_path").nullable();
    table.string("status").notNullable().defaultTo("extended");
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("alumni_referrals", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("alumni_user_id").notNullable();
    table.uuid("student_user_id").notNullable();
    table.uuid("job_id").nullable();
    table.text("note").nullable();
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("saved_jobs", (table) => {
    table.uuid("tenant_id").notNullable();
    table.uuid("user_id").notNullable();
    table.uuid("job_id").notNullable().references("id").inTable("jobs");
    table.primary(["user_id", "job_id"]);
  });

  await knex.schema.createTable("documents", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("user_id").notNullable();
    table.string("kind").notNullable();
    table.string("path").notNullable();
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("consents", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("user_id").notNullable();
    table.string("purpose").notNullable();
    table.timestamp("accepted_at").notNullable().defaultTo(knex.fn.now());
    table.index(["tenant_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("consents");
  await knex.schema.dropTableIfExists("documents");
  await knex.schema.dropTableIfExists("saved_jobs");
  await knex.schema.dropTableIfExists("alumni_referrals");
  await knex.schema.dropTableIfExists("offers");
  await knex.schema.alterTable("jobs", (table) => {
    table.dropForeign(["drive_id"]);
  });
  await knex.schema.dropTableIfExists("drives");
}
