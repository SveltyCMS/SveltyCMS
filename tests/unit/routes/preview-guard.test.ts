/**
 * @file tests/unit/routes/preview-guard.test.ts
 * @description Unit tests for the preview handshake open-redirect guard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/services/content/preview-service", () => ({
  previewService: {
    validateToken: vi.fn(() => ({ valid: true, entryId: "e1", userId: "u1", tenantId: "t1" })),
  },
}));

import { GET } from "@src/routes/api/preview/+server";

function makeRequest(slug: string) {
  const url = new URL(
    `http://localhost:5173/api/preview?preview_token=tok&slug=${encodeURIComponent(slug)}`,
  );
  const cookies = { set: vi.fn() };
  return { url, cookies };
}

/** SvelteKit's error()/redirect() throw branded errors — capture them (async route). */
async function captureThrow(
  fn: () => Promise<unknown>,
): Promise<{ status?: number; location?: string }> {
  try {
    await fn();
    return {};
  } catch (err: any) {
    if (err?.status !== undefined) return { status: err.status, location: err.location };
    throw err;
  }
}

describe("Preview handshake redirect guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a normal relative slug", async () => {
    const { url, cookies } = makeRequest("/blog/my-post");
    const result = await captureThrow(() =>
      GET({ request: { url: url.toString() } as any, url, cookies } as any),
    );
    // Valid token + relative slug → 307 redirect to the target
    expect(result.location).toContain("/blog/my-post");
    expect(result.status).toBe(307);
  });

  it("rejects protocol-relative slugs (//evil.com) with 400", async () => {
    const { url, cookies } = makeRequest("//evil.com");
    const result = await captureThrow(() =>
      GET({ request: { url: url.toString() } as any, url, cookies } as any),
    );
    expect(result.status).toBe(400);
  });

  it("rejects absolute http(s) slugs with 400", async () => {
    for (const slug of ["http://evil.com", "https://evil.com/x"]) {
      const { url, cookies } = makeRequest(slug);
      const result = await captureThrow(() =>
        GET({ request: { url: url.toString() } as any, url, cookies } as any),
      );
      expect(result.status).toBe(400);
    }
  });
});
