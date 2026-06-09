import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the pure synchronous parts of auth.ts that don't need DB or cookies.
// verifySession is exported and is pure (crypto only, no I/O).
import { verifySession } from "../auth";

// Minimal environment setup for the secret
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long";
});

describe("verifySession()", () => {
  // Build a valid token the same way signSession would
  function makeToken(userId: string, expOffset = 1000 * 60 * 60): string {
    const payload = JSON.stringify({
      userId,
      exp: Date.now() + expOffset,
    });
    const { createHmac } = require("crypto");
    const sig = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(payload)
      .digest("hex");
    return Buffer.from(payload).toString("base64") + "." + sig;
  }

  it("returns userId for a valid token", () => {
    const token = makeToken("user-123");
    const result = verifySession(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("returns null for an expired token", () => {
    const token = makeToken("user-456", -1000); // expired 1 second ago
    expect(verifySession(token)).toBeNull();
  });

  it("returns null for a tampered payload", () => {
    const token = makeToken("user-789");
    const [, sig] = token.split(".");
    // Replace userId in the payload with a different one
    const fakePayload = Buffer.from(
      JSON.stringify({ userId: "attacker", exp: Date.now() + 9999999 })
    ).toString("base64");
    expect(verifySession(fakePayload + "." + sig)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("only.two")).toBeNull();
  });

  it("returns null when AUTH_SECRET differs", () => {
    const token = makeToken("user-abc");
    process.env.AUTH_SECRET = "completely-different-secret-1234567890";
    expect(verifySession(token)).toBeNull();
  });
});
