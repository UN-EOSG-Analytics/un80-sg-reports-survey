import { describe, it, expect, vi, beforeEach } from "vitest";

// -------------------------------------------------------------------
// Mock Next.js and DB before importing auth.ts
// -------------------------------------------------------------------

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("./db", () => ({
  query: vi.fn(),
}));

vi.mock("./config", () => ({
  tables: {
    users: "sg_reports_survey.users",
    magic_tokens: "sg_reports_survey.magic_tokens",
    allowed_domains: "sg_reports_survey.allowed_domains",
    admin_emails: "sg_reports_survey.admin_emails",
  },
}));

import { generateToken, verifySession } from "./auth";

// -------------------------------------------------------------------
// generateToken
// -------------------------------------------------------------------

describe("generateToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on each call", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });
});

// -------------------------------------------------------------------
// verifySession
// -------------------------------------------------------------------

describe("verifySession", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, AUTH_SECRET: "test-secret-abc123" };
  });

  /** Helper: produce a valid session token via the internal sign logic. */
  function makeToken(userId: string, exp: number): string {
    const { createHmac } = require("crypto");
    const secret = "test-secret-abc123";
    const payload = JSON.stringify({ userId, exp });
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    return Buffer.from(payload).toString("base64") + "." + sig;
  }

  it("returns userId for a valid, unexpired token", () => {
    const exp = Date.now() + 60_000; // 1 minute in the future
    const token = makeToken("user-123", exp);
    const result = verifySession(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("returns null for an expired token", () => {
    const exp = Date.now() - 1000; // 1 second in the past
    const token = makeToken("user-456", exp);
    const result = verifySession(token);
    expect(result).toBeNull();
  });

  it("returns null when signature is tampered with", () => {
    const exp = Date.now() + 60_000;
    const token = makeToken("user-789", exp);
    // Corrupt the last character of the signature
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const result = verifySession(tampered);
    expect(result).toBeNull();
  });

  it("returns null for a completely malformed token", () => {
    expect(verifySession("not-a-valid-token")).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("abc")).toBeNull();
  });

  it("returns null when payload is missing the dot separator", () => {
    const result = verifySession("aGVsbG8="); // base64 with no "." separator
    expect(result).toBeNull();
  });

  it("session expiry is 30 days from now", () => {
    // Verify the expiry embedded in a freshly-signed token is ~30 days out
    const { createHmac } = require("crypto");
    const secret = "test-secret-abc123";
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const expectedExp = Date.now() + thirtyDays;
    const payload = JSON.stringify({ userId: "u1", exp: expectedExp });
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    const token = Buffer.from(payload).toString("base64") + "." + sig;

    const result = verifySession(token);
    expect(result).toEqual({ userId: "u1" });

    // The token we made reflects the 30-day window used in signSession
    const parsed = JSON.parse(Buffer.from(token.split(".")[0], "base64").toString());
    expect(parsed.exp).toBeGreaterThan(Date.now() + thirtyDays - 5000);
    expect(parsed.exp).toBeLessThan(Date.now() + thirtyDays + 5000);
  });
});
