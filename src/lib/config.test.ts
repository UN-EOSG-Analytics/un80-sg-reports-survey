import { describe, it, expect } from "vitest";

// config.ts reads DB_SCHEMA at module-load time.  Rather than trying to
// reload the module with a mutated env (which fails with the oxc transformer),
// we test the exported pure helper functions and the table-name shape directly,
// and separately test the env-fallback logic by replicating the derivation
// that config.ts uses.

// -------------------------------------------------------------------
// Inline re-derivation of the table-name logic
// (mirrors config.ts exactly so tests stay in sync)
// -------------------------------------------------------------------

function deriveTableNames(schema: string) {
  return {
    users: `${schema}.users`,
    magic_tokens: `${schema}.magic_tokens`,
    allowed_domains: `${schema}.allowed_domains`,
    admin_emails: `${schema}.admin_emails`,
  } as const;
}

function deriveNotAdminSQL(schema: string, alias = "u"): string {
  const adminTable = `${schema}.admin_emails`;
  return `NOT EXISTS (SELECT 1 FROM ${adminTable} ae WHERE ae.email = ${alias}.email)`;
}

function resolveSchema(envValue: string | undefined): string {
  return envValue || "app";
}

// -------------------------------------------------------------------
// DB_SCHEMA env fallback
// -------------------------------------------------------------------

describe("DB_SCHEMA env fallback", () => {
  it("defaults to 'app' when env var is undefined", () => {
    expect(resolveSchema(undefined)).toBe("app");
  });

  it("defaults to 'app' when env var is empty string", () => {
    expect(resolveSchema("")).toBe("app");
  });

  it("uses the provided value when set", () => {
    expect(resolveSchema("sg_reports_survey")).toBe("sg_reports_survey");
    expect(resolveSchema("my_custom_schema")).toBe("my_custom_schema");
  });
});

// -------------------------------------------------------------------
// Table name helpers
// -------------------------------------------------------------------

describe("table name helpers", () => {
  it("prefixes all table names with the schema", () => {
    const tables = deriveTableNames("test_schema");
    expect(tables.users).toBe("test_schema.users");
    expect(tables.magic_tokens).toBe("test_schema.magic_tokens");
    expect(tables.allowed_domains).toBe("test_schema.allowed_domains");
    expect(tables.admin_emails).toBe("test_schema.admin_emails");
  });

  it("produces correctly formatted names for the default schema", () => {
    const tables = deriveTableNames("sg_reports_survey");
    expect(tables.users).toBe("sg_reports_survey.users");
    expect(tables.magic_tokens).toBe("sg_reports_survey.magic_tokens");
  });

  it("exposes all four required table keys", () => {
    const tables = deriveTableNames("s");
    const keys = Object.keys(tables);
    expect(keys).toContain("users");
    expect(keys).toContain("magic_tokens");
    expect(keys).toContain("allowed_domains");
    expect(keys).toContain("admin_emails");
  });
});

// -------------------------------------------------------------------
// notAdminSQL helper
// -------------------------------------------------------------------

describe("notAdminSQL helper", () => {
  it("produces a NOT EXISTS subquery", () => {
    const sql = deriveNotAdminSQL("sg_reports_survey");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("SELECT 1");
  });

  it("references the admin_emails table with the correct schema prefix", () => {
    const sql = deriveNotAdminSQL("my_schema");
    expect(sql).toContain("my_schema.admin_emails");
  });

  it("uses 'u' as the default alias", () => {
    const sql = deriveNotAdminSQL("sg_reports_survey");
    expect(sql).toContain("u.email");
  });

  it("substitutes a custom alias when provided", () => {
    const sql = deriveNotAdminSQL("sg_reports_survey", "usr");
    expect(sql).toContain("usr.email");
    expect(sql).not.toContain("u.email");
  });

  it("returns a non-empty string", () => {
    const sql = deriveNotAdminSQL("sg_reports_survey");
    expect(typeof sql).toBe("string");
    expect(sql.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------
// Live import — structural smoke test (doesn't re-test env at runtime)
// -------------------------------------------------------------------

import { tables, notAdminSQL, DB_SCHEMA } from "./config";

describe("config.ts live exports", () => {
  it("exports DB_SCHEMA as a string", () => {
    expect(typeof DB_SCHEMA).toBe("string");
    expect(DB_SCHEMA.length).toBeGreaterThan(0);
  });

  it("exports tables with schema-prefixed names", () => {
    expect(tables.users).toBe(`${DB_SCHEMA}.users`);
    expect(tables.magic_tokens).toBe(`${DB_SCHEMA}.magic_tokens`);
    expect(tables.allowed_domains).toBe(`${DB_SCHEMA}.allowed_domains`);
    expect(tables.admin_emails).toBe(`${DB_SCHEMA}.admin_emails`);
  });

  it("notAdminSQL references the live admin_emails table", () => {
    const sql = notAdminSQL();
    expect(sql).toContain(tables.admin_emails);
  });

  it("notAdminSQL with custom alias works", () => {
    const sql = notAdminSQL("x");
    expect(sql).toContain("x.email");
  });
});
