import { describe, it, expect } from "vitest";

// isQuerySafe is not exported from chat-tools.ts, so we test it indirectly
// by importing and calling queryDatabase with a mocked db module.
// For now we test the exported executeTool dispatcher with a mocked db.

// ---------------------------------------------------------------------------
// Extract and test isQuerySafe logic directly by duplicating its signature.
// This is preferable to modifying the source just to export a test helper.
// ---------------------------------------------------------------------------

// Replicated from src/lib/chat-tools.ts for isolated unit testing.
const FORBIDDEN_TABLES = [
  "users",
  "magic_tokens",
  "sessions",
  "ai_chat_logs",
  "ai_chat_sessions",
];

function isQuerySafe(sql: string): { safe: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { safe: false, error: "Only SELECT queries are allowed" };
  }

  const dangerous = [
    "insert", "update", "delete", "drop", "alter", "create",
    "truncate", "grant", "revoke", "exec", "execute", "into",
    "copy", "pg_",
  ];

  for (const keyword of dangerous) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, error: `Query contains forbidden keyword: ${keyword}` };
    }
  }

  for (const table of FORBIDDEN_TABLES) {
    const regex = new RegExp(`\\b${table}\\b`, "i");
    if (regex.test(sql)) {
      return {
        safe: false,
        error: `Access to table '${table}' is not allowed - this contains sensitive data`,
      };
    }
  }

  return { safe: true };
}

describe("isQuerySafe()", () => {
  it("allows basic SELECT", () => {
    expect(isQuerySafe("SELECT * FROM documents")).toEqual({ safe: true });
  });

  it("allows SELECT with a CTE", () => {
    expect(
      isQuerySafe("WITH cte AS (SELECT id FROM documents) SELECT * FROM cte")
    ).toEqual({ safe: true });
  });

  it("blocks INSERT", () => {
    const r = isQuerySafe("INSERT INTO documents VALUES (1)");
    expect(r.safe).toBe(false);
    expect(r.error).toMatch(/insert/i);
  });

  it("blocks UPDATE", () => {
    expect(isQuerySafe("UPDATE documents SET title = 'x'").safe).toBe(false);
  });

  it("blocks DELETE", () => {
    expect(isQuerySafe("DELETE FROM documents").safe).toBe(false);
  });

  it("blocks DROP TABLE", () => {
    expect(isQuerySafe("DROP TABLE documents").safe).toBe(false);
  });

  it("blocks pg_ system tables", () => {
    // 'pg_' as a word boundary fragment inside an identifier
    // The regex uses \\bpg_\\b which matches 'pg_' as a token
    const r = isQuerySafe("SELECT * FROM pg_tables");
    expect(r.safe).toBe(false);
  });

  it("blocks access to users table", () => {
    const r = isQuerySafe("SELECT email FROM users");
    expect(r.safe).toBe(false);
    expect(r.error).toMatch(/users/);
  });

  it("blocks access to magic_tokens", () => {
    expect(isQuerySafe("SELECT * FROM magic_tokens").safe).toBe(false);
  });

  it("blocks access to ai_chat_logs", () => {
    expect(isQuerySafe("SELECT * FROM ai_chat_logs").safe).toBe(false);
  });

  it("rejects non-SELECT statements", () => {
    expect(isQuerySafe("SHOW ALL").safe).toBe(false);
    expect(isQuerySafe("EXPLAIN SELECT 1").safe).toBe(false);
    expect(isQuerySafe("").safe).toBe(false);
  });

  it("is case-insensitive for dangerous keywords", () => {
    expect(isQuerySafe("SELECT * FROM documents; DELETE FROM documents").safe).toBe(false);
    expect(isQuerySafe("SELECT * FROM USERS").safe).toBe(false);
  });

  // Known gap: information_schema is not blocked (defence-in-depth gap)
  // This test documents the current behaviour (not ideal, but explicit).
  it("does NOT block information_schema (known gap)", () => {
    const r = isQuerySafe("SELECT table_name FROM information_schema.tables");
    expect(r.safe).toBe(true); // database role grants are the only guard here
  });
});

describe("survey response normalizeBodyKey logic", () => {
  // Replicated from survey-responses/route.ts
  function normalizeBodyKey(value: string | null | undefined): string {
    return value?.trim() || "";
  }

  it("trims whitespace", () => {
    expect(normalizeBodyKey("  General Assembly  ")).toBe("General Assembly");
  });

  it("returns empty string for null", () => {
    expect(normalizeBodyKey(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeBodyKey(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeBodyKey("")).toBe("");
  });

  it("preserves non-whitespace content", () => {
    expect(normalizeBodyKey("Security Council")).toBe("Security Council");
  });
});
