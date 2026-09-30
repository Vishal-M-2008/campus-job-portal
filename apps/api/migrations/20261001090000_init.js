export async function up(knex) {
  await knex.raw('create extension if not exists "pgcrypto"');

  await knex.schema.createTable("colleges", (table) => {
    table.uuid("id").primary();
    table.string("name").notNullable();
    table.string("slug").notNullable().unique();
    table.string("timezone").notNullable().defaultTo("Asia/Kolkata");
    table.string("academic_year").nullable();
    table.jsonb("theme_json").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("college_domains", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable().references("id").inTable("colleges").onDelete("CASCADE");
    table.string("domain").notNullable();
    table.unique(["tenant_id", "domain"]);
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").nullable().references("id").inTable("colleges");
    table.string("email").notNullable();
    table.string("password_hash").notNullable();
    table.string("name").notNullable();
    table.string("phone").nullable();
    table.integer("failed_attempts").notNullable().defaultTo(0);
    table.timestamp("locked_until").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["tenant_id"]);
  });
  await knex.raw(
    "create unique index users_tenant_email on users (tenant_id, email) where tenant_id is not null",
  );
  await knex.raw(
    "create unique index users_platform_email on users (email) where tenant_id is null",
  );

  await knex.schema.createTable("user_roles", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tenant_id").nullable().references("id").inTable("colleges");
    table.string("role").notNullable();
    table.unique(["user_id", "role"]);
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("sessions", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_hash").notNullable().unique();
    table.string("csrf_token").notNullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("password_resets", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_hash").notNullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("used_at").nullable();
  });

  await knex.schema.createTable("companies", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable().references("id").inTable("colleges");
    table.string("name").notNullable();
    table.string("website").nullable();
    table.string("logo_path").nullable();
    table.boolean("approved").notNullable().defaultTo(false);
    table.index(["tenant_id", "id"]);
  });

  await knex.schema.createTable("company_users", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("company_id").notNullable().references("id").inTable("companies").onDelete("CASCADE");
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("company_role").notNullable();
    table.unique(["company_id", "user_id"]);
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("feature_flags", (table) => {
    table.uuid("tenant_id").notNullable();
    table.string("key").notNullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.primary(["tenant_id", "key"]);
  });

  await knex.schema.createTable("subscription_entitlements", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable().unique();
    table.string("plan").notNullable().defaultTo("free");
    table.integer("seat_limit").nullable();
    table.string("billing_provider").nullable();
    table.string("external_customer_id").nullable();
  });

  await knex.schema.createTable("placement_policies", (table) => {
    table.uuid("tenant_id").primary().references("id").inTable("colleges");
    table.integer("max_open_applications").nullable();
    table.decimal("min_cgpa", 4, 2).nullable();
    table.integer("max_backlogs").nullable();
    table.jsonb("departments").nullable();
    table.jsonb("batches").nullable();
    table.boolean("require_faculty_signoff").notNullable().defaultTo(false);
    table.boolean("offer_freeze").notNullable().defaultTo(false);
    table.boolean("allow_alumni_referrals").notNullable().defaultTo(true);
  });

  await knex.schema.createTable("student_profiles", (table) => {
    table.uuid("user_id").primary().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tenant_id").notNullable();
    table.string("department").nullable();
    table.string("batch").nullable();
    table.decimal("cgpa", 4, 2).nullable();
    table.integer("backlogs").nullable();
    table.integer("graduation_year").nullable();
    table.jsonb("education").nullable();
    table.jsonb("skills").nullable();
    table.jsonb("projects").nullable();
    table.jsonb("links").nullable();
    table.string("resume_path").nullable();
    table.uuid("mentor_user_id").nullable();
    table.timestamp("faculty_signoff_at").nullable();
    table.text("faculty_note").nullable();
    table.boolean("force_unlocked").notNullable().defaultTo(false);
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("jobs", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("company_id").notNullable().references("id").inTable("companies");
    table.string("title").notNullable();
    table.text("description").notNullable().defaultTo("");
    table.string("location").nullable();
    table.jsonb("skills").nullable();
    table.string("status").notNullable().defaultTo("draft");
    table.uuid("created_by").notNullable();
    table.uuid("drive_id").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["tenant_id", "id"]);
    table.index(["tenant_id", "status"]);
  });

  await knex.schema.createTable("applications", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("job_id").notNullable().references("id").inTable("jobs");
    table.uuid("student_user_id").notNullable().references("id").inTable("users");
    table.string("status").notNullable().defaultTo("submitted");
    table.string("reject_reason").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["job_id", "student_user_id"]);
    table.index(["tenant_id", "id"]);
  });

  await knex.schema.createTable("interviews", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("application_id").notNullable().references("id").inTable("applications");
    table.timestamp("starts_at").nullable();
    table.string("location").nullable();
    table.string("meeting_url").nullable();
    table.uuid("panel_user_id").nullable();
    table.timestamp("reschedule_requested_at").nullable();
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("application_notes", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").notNullable();
    table.uuid("application_id").notNullable().references("id").inTable("applications");
    table.uuid("author_user_id").notNullable();
    table.text("body").notNullable();
    table.boolean("visible_to_recruiter").notNullable().defaultTo(true);
    table.index(["tenant_id"]);
  });

  await knex.schema.createTable("audit_logs", (table) => {
    table.uuid("id").primary();
    table.uuid("tenant_id").nullable();
    table.uuid("actor_user_id").nullable();
    table.string("action").notNullable();
    table.jsonb("meta").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["tenant_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("application_notes");
  await knex.schema.dropTableIfExists("interviews");
  await knex.schema.dropTableIfExists("applications");
  await knex.schema.dropTableIfExists("jobs");
  await knex.schema.dropTableIfExists("student_profiles");
  await knex.schema.dropTableIfExists("placement_policies");
  await knex.schema.dropTableIfExists("subscription_entitlements");
  await knex.schema.dropTableIfExists("feature_flags");
  await knex.schema.dropTableIfExists("company_users");
  await knex.schema.dropTableIfExists("companies");
  await knex.schema.dropTableIfExists("password_resets");
  await knex.schema.dropTableIfExists("sessions");
  await knex.schema.dropTableIfExists("user_roles");
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("college_domains");
  await knex.schema.dropTableIfExists("colleges");
}
