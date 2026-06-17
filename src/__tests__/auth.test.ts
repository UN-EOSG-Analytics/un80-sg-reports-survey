/**
 * Unit tests for src/lib/auth.ts pure/synchronous functions.
 *
 * Run with:  npx vitest run src/__tests__/auth.test.ts
 *
 * These tests cover the session signing / verification logic which is
 * self-contained and has no DB or network dependencies.
 */

import { describe, it, expect, beforeAll } from "vitest";

// We test the exported functions directly, setting AUTH_SECRET via env before import.
beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-production";
});

// Dynamic import so the module reads the env var we set above.
const getModule = () => import("../lib/auth");

describe("verifySession", () => {
  it("returns null for an empty string", async () => {
    const { verifySession } = await getModule();
    expect(verifySession("")).toBeNull();
  });

  it("returns null for a token with no dot separator", async () => {
    const { verifySession } = await getModule();
    expect(verifySession("nodot")).toBeNull();
  });

  it("returns null for a token with a tampered signature", async () => {
    const { verifySession } = await getModule();
    const payload = Buffer.from(
      JSON.stringify({ userId: "abc", exp: Date.now() + 1_000_000 })
    ).toString("base64");
    const fakeSig = "0".repeat(64);
    expect(verifySession(`${payload}.${fakeSig}`)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { verifySession } = await getModule();
    const payload = Buffer.from(
      JSON.stringify({ userId: "abc", exp: Date.now() - 1 })
    ).toString("base64");
    const { createHmac } = await import("crypto");
    const payloadStr = Buffer.from(payload, "base64").toString();
    const sig = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(payloadStr)
      .digest("hex");
    expect(verifySession(`${payload}.${sig}`)).toBeNull();
  });
});

describe("generateToken", () => {
  it("generates a 64-character hex string", async () => {
    const { generateToken } = await getModule();
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens on successive calls", async () => {
    const { generateToken } = await getModule();
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("isAllowedDomain (shape contract)", () => {
  it("exports isAllowedDomain as a function", async () => {
    const { isAllowedDomain } = await getModule();
    expect(typeof isAllowedDomain).toBe("function");
  });
});
