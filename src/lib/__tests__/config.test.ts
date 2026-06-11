/**
 * Tests for src/lib/config.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We test the module's exports without importing it directly so we can
// vary the DB_SCHEMA env var between tests.

describe("DB_SCHEMA configuration", () => {
  const originalEnv = process.env.DB_SCHEMA;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DB_SCHEMA;
    } else {
      process.env.DB_SCHEMA = originalEnv;
    }
  });

  it("notAdminSQL returns a SQL fragment that references admin_emails", async () => {
    // We test the function's output shape, not the exact SQL, since the
    // schema prefix can vary.
    process.env.DB_SCHEMA = "sg_reports_survey";
    // Re-import after env change
    const { notAdminSQL } = await import("../config");
    const sql = notAdminSQL();
    expect(sql).toContain("admin_emails");
    expect(sql).toContain("ae.email = u.email");
  });

  it("notAdminSQL accepts a custom alias", async () => {
    process.env.DB_SCHEMA = "sg_reports_survey";
    const { notAdminSQL } = await import("../config");
    const sql = notAdminSQL("usr");
    expect(sql).toContain("usr.email");
  });
});
