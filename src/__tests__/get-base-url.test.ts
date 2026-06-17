/**
 * Unit tests for src/lib/get-base-url.ts
 *
 * Run with:  npx vitest run src/__tests__/get-base-url.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

const mockHeaders = async (map: Record<string, string | null>) => {
  const { headers } = await import("next/headers");
  (headers as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (key: string) => map[key] ?? null,
  });
};

describe("getBaseUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.PORT;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses http for localhost host header", async () => {
    await mockHeaders({ host: "localhost:3000", "x-forwarded-proto": "https" });
    const { getBaseUrl } = await import("../lib/get-base-url");
    const url = await getBaseUrl();
    expect(url).toBe("http://localhost:3000");
  });

  it("uses https for non-localhost host header", async () => {
    await mockHeaders({
      host: "app.example.un.org",
      "x-forwarded-proto": "https",
    });
    const { getBaseUrl } = await import("../lib/get-base-url");
    const url = await getBaseUrl();
    expect(url).toBe("https://app.example.un.org");
  });

  it("falls back to BASE_URL env var when headers unavailable", async () => {
    const { headers } = await import("next/headers");
    (headers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("headers() not available")
    );
    process.env.BASE_URL = "https://custom.domain.org";
    const { getBaseUrl } = await import("../lib/get-base-url");
    const url = await getBaseUrl();
    expect(url).toBe("https://custom.domain.org");
  });

  it("falls back to localhost when nothing is configured", async () => {
    const { headers } = await import("next/headers");
    (headers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("headers() not available")
    );
    const { getBaseUrl } = await import("../lib/get-base-url");
    const url = await getBaseUrl();
    expect(url).toBe("http://localhost:3000");
  });

  it("strips trailing slash from BASE_URL", async () => {
    const { headers } = await import("next/headers");
    (headers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("headers() not available")
    );
    process.env.BASE_URL = "https://custom.domain.org/";
    const { getBaseUrl } = await import("../lib/get-base-url");
    const url = await getBaseUrl();
    expect(url).toBe("https://custom.domain.org");
  });
});
