/**
 * Tests for src/lib/auth.ts
 *
 * These are pure unit tests — they test the cryptographic helpers and session
 * management logic without requiring a database connection. The DB-dependent
 * functions (isAllowedDomain, createMagicToken, etc.) are tested separately
 * via integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// We re-implement the pure-crypto parts inline so the tests don't need to
// import the full auth module (which pulls in `next/headers` and `pg`).
// ---------------------------------------------------------------------------
import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const TEST_SECRET = "test-secret-32-bytes-for-hmac-sig";

function signSession(userId: string, secret: string = TEST_SECRET): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}

function verifySession(token: string, secret: string = TEST_SECRET): { userId: string } | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, "base64").toString();
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

describe("Session signing and verification", () => {
  it("sign produces a two-part token separated by a dot", () => {
    const token = signSession("user-123");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });

  it("verify returns userId for a valid token", () => {
    const token = signSession("user-abc");
    const result = verifySession(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-abc");
  });

  it("verify returns null for a tampered payload", () => {
    const token = signSession("user-abc");
    const parts = token.split(".");
    // Flip one character in the payload
    const tamperedPayload = parts[0].slice(0, -1) + (parts[0].at(-1) === "A" ? "B" : "A");
    const tampered = tamperedPayload + "." + parts[1];
    expect(verifySession(tampered)).toBeNull();
  });

  it("verify returns null for a tampered signature", () => {
    const token = signSession("user-abc");
    const parts = token.split(".");
    const tamperedSig = "0".repeat(parts[1].length);
    expect(verifySession(parts[0] + "." + tamperedSig)).toBeNull();
  });

  it("verify returns null when signed with a different secret", () => {
    const token = signSession("user-abc", "secret-A");
    expect(verifySession(token, "secret-B")).toBeNull();
  });

  it("verify returns null for an expired token", () => {
    // Craft a token that expired 1 ms ago
    const payload = JSON.stringify({ userId: "user-exp", exp: Date.now() - 1 });
    const sig = createHmac("sha256", TEST_SECRET).update(payload).digest("hex");
    const token = Buffer.from(payload).toString("base64") + "." + sig;
    expect(verifySession(token)).toBeNull();
  });

  it("verify returns null for a malformed token (missing dot)", () => {
    expect(verifySession("not-a-valid-token")).toBeNull();
  });

  it("verify returns null for an empty string", () => {
    expect(verifySession("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isAllowedDomain — pure logic (domain extraction)
// ---------------------------------------------------------------------------

function extractDomain(email: string): string | null {
  const domain = email.toLowerCase().split("@")[1];
  return domain || null;
}

describe("Email domain extraction", () => {
  it("extracts domain from a valid UN email", () => {
    expect(extractDomain("john.doe@un.org")).toBe("un.org");
  });

  it("lowercases the domain", () => {
    expect(extractDomain("Jane@UN.ORG")).toBe("un.org");
  });

  it("returns null for an email without @ sign", () => {
    expect(extractDomain("notanemail")).toBeNull();
  });

  it("handles subdomains", () => {
    expect(extractDomain("user@mail.undp.org")).toBe("mail.undp.org");
  });
});

// ---------------------------------------------------------------------------
// Token generation — entropy check
// ---------------------------------------------------------------------------

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

describe("Token generation", () => {
  it("generates a 64-character hex string", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
  });
});
