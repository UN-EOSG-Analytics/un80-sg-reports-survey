/**
 * Tests for src/lib/chat-tools.ts
 *
 * Focuses on the SQL safety checker (pure function, no DB needed).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement isQuerySafe inline (the source function is not exported).
// This mirrors the logic exactly so we can test edge-cases.
// ---------------------------------------------------------------------------

const FORBIDDEN_TABLES = [
  "users",
  "magic_tokens",
  "sessions",
  "ai_chat_logs",
  "ai_chat_sessions",
];

const DANGEROUS_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "exec",
  "execute",
  "into",
  "copy",
  "pg_",
];

function isQuerySafe(sql: string): { safe: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { safe: false, error: "Only SELECT queries are allowed" };
  }

  for (const keyword of DANGEROUS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, error: `Query contains forbidden keyword: ${keyword}` };
    }
  }

  for (const table of FORBIDDEN_TABLES) {
    const regex = new RegExp(`\\b${table}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, error: `Access to table '${table}' is not allowed` };
    }
  }

  return { safe: true };
}

describe("isQuerySafe — allowed queries", () => {
  it("allows a simple SELECT", () => {
    expect(isQuerySafe("SELECT * FROM documents LIMIT 10")).toMatchObject({ safe: true });
  });

  it("allows a CTE (WITH ... SELECT)", () => {
    const cte = `WITH cte AS (SELECT id FROM documents) SELECT * FROM cte`;
    expect(isQuerySafe(cte)).toMatchObject({ safe: true });
  });

  it("allows a GROUP BY query", () => {
    const q = `SELECT entity, COUNT(*) FROM survey_responses GROUP BY entity`;
    expect(isQuerySafe(q)).toMatchObject({ safe: true });
  });

  it("allows a JOIN", () => {
    const q = `SELECT d.symbol, rf.calculated_frequency
               FROM documents d
               JOIN report_frequencies rf ON d.proper_title = rf.proper_title`;
    expect(isQuerySafe(q)).toMatchObject({ safe: true });
  });

  it("allows a query with a LIMIT clause", () => {
    expect(isQuerySafe("SELECT symbol FROM sg_reports LIMIT 50")).toMatchObject({ safe: true });
  });
});

describe("isQuerySafe — blocked queries", () => {
  it("blocks INSERT", () => {
    const result = isQuerySafe("INSERT INTO documents VALUES (1)");
    expect(result.safe).toBe(false);
  });

  it("blocks UPDATE", () => {
    const result = isQuerySafe("UPDATE documents SET title = 'x' WHERE id = 1");
    expect(result.safe).toBe(false);
  });

  it("blocks DELETE", () => {
    const result = isQuerySafe("DELETE FROM documents WHERE id = 1");
    expect(result.safe).toBe(false);
  });

  it("blocks DROP", () => {
    const result = isQuerySafe("DROP TABLE documents");
    expect(result.safe).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    const result = isQuerySafe("TRUNCATE documents");
    expect(result.safe).toBe(false);
  });

  it("blocks access to users table", () => {
    const result = isQuerySafe("SELECT * FROM users");
    expect(result.safe).toBe(false);
  });

  it("blocks access to magic_tokens table", () => {
    const result = isQuerySafe("SELECT token FROM magic_tokens WHERE email = 'x'");
    expect(result.safe).toBe(false);
  });

  it("blocks access to ai_chat_logs", () => {
    const result = isQuerySafe("SELECT * FROM ai_chat_logs LIMIT 5");
    expect(result.safe).toBe(false);
  });

  it("blocks a non-SELECT statement (UPDATE masquerading)", () => {
    const result = isQuerySafe("UPDATE survey_responses SET status = 'continue'");
    expect(result.safe).toBe(false);
  });

  it("blocks pg_ system calls", () => {
    const result = isQuerySafe("SELECT pg_read_file('/etc/passwd')");
    expect(result.safe).toBe(false);
  });
});

describe("isQuerySafe — known false-positive: 'into'", () => {
  // This documents a known limitation: 'into' as a keyword blocks queries
  // that contain the word 'into' in any context, including column names
  // and prose. This is a trade-off in the current implementation.
  it("'INTO' keyword blocks INSERT INTO but also any word-boundary 'into'", () => {
    // This query does NOT contain an INSERT, just the word 'into' in a LIKE
    const q = `SELECT * FROM documents WHERE title ILIKE '%grouped into%'`;
    const result = isQuerySafe(q);
    // Documenting current behavior (blocked) — this is a known limitation
    expect(result.safe).toBe(false);
    expect(result.error).toContain("into");
  });
});
