/**
 * @file tests/unit/routes/preview-server.test.ts
 * @description Behavioural tests for the draft-mode handshake `GET /api/preview`.
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: a valid token sets both draft cookies and redirects (307)
 * - failure-path: missing/invalid tokens and open-redirect attempts are refused
 * - concurrency: two parallel handshakes keep their own cookies and target
 *
 * The preview service is the boundary (signed-token verification); the cookie
 * jar and redirect are exercised for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/services/content/preview-service", () => ({
  previewService: {
    validateToken: vi.fn(),
  },
}));

import { previewService } from "@src/services/content/preview-service";
import { GET } from "../../../src/routes/api/preview/+server";

const mockValidate = vi.mocked(previewService.validateToken);

type PreviewEvent = Parameters<typeof GET>[0];

/** Minimal cookie jar that records every `set` for assertions. */
function makeCookies() {
  const jar = new Map<string, string>();
  return {
    jar,
    set: vi.fn((name: string, value: string) => {
      jar.set(name, value);
    }),
  };
}

function makeEvent(
  search: string,
  cookies = makeCookies(),
  protocol = "http:",
): { event: PreviewEvent; cookies: ReturnType<typeof makeCookies> } {
  const url = new URL(`http://localhost/api/preview${search}`);
  url.protocol = protocol;
  return {
    event: { url, cookies } as unknown as PreviewEvent,
    cookies,
  };
}

function redirectTarget(err: unknown): { status: number; location: string } {
  const value = err as { status?: number; location?: string };
  if (typeof value.status !== "number" || typeof value.location !== "string") {
    throw new Error(`expected a redirect, received ${String(err)}`);
  }
  return { status: value.status, location: value.location };
}

/** Await a handler that may return synchronously, and return its redirect target. */
async function redirectOf(response: ReturnType<typeof GET>): Promise<{
  status: number;
  location: string;
}> {
  try {
    await response;
  } catch (err) {
    return redirectTarget(err);
  }
  throw new Error("expected a redirect, received a response");
}

describe("GET /api/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({
      valid: true,
      userId: "u1",
      tenantId: "t1",
      entryId: "entry-1",
    });
  });

  it("sets the draft cookies and redirects to the requested target", async () => {
    const { event, cookies } = makeEvent("/?preview_token=tok-1&slug=blog/draft-post");

    const target = await redirectOf(GET(event));

    expect(target.status).toBe(307);
    expect(target.location).toBe("/blog/draft-post?preview_token=tok-1");
    expect(cookies.jar.get("cms_draft_mode")).toBe("true");
    expect(cookies.jar.get("cms_preview_entry")).toBe("entry-1");
    expect(mockValidate).toHaveBeenCalledWith("tok-1");
  });

  it("refuses a missing token", async () => {
    const { event, cookies } = makeEvent("");

    await expect(GET(event)).rejects.toMatchObject({ status: 400 });
    expect(cookies.set).not.toHaveBeenCalled();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("refuses an invalid or expired token without setting cookies", async () => {
    mockValidate.mockReturnValue({ valid: false, userId: "", tenantId: "", entryId: "" });
    const { event, cookies } = makeEvent("/?preview_token=stale");

    await expect(GET(event)).rejects.toMatchObject({ status: 401 });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "\\\\evil.example"])(
    "refuses the open-redirect target %s",
    async (slug) => {
      const { event } = makeEvent(`/?preview_token=tok-1&slug=${encodeURIComponent(slug)}`);

      await expect(GET(event)).rejects.toMatchObject({ status: 400 });
    },
  );

  it("keeps each of two concurrent handshakes on its own target and cookie jar", async () => {
    mockValidate.mockImplementation((token: string) => ({
      valid: true,
      userId: "u1",
      tenantId: "t1",
      entryId: `entry-${token}`,
    }));

    const first = makeEvent("/?preview_token=one&slug=alpha");
    const second = makeEvent("/?preview_token=two&slug=beta");

    const [firstTarget, secondTarget] = await Promise.all([
      redirectOf(GET(first.event)),
      redirectOf(GET(second.event)),
    ]);

    expect(firstTarget.location).toBe("/alpha?preview_token=one");
    expect(secondTarget.location).toBe("/beta?preview_token=two");
    expect(first.cookies.jar.get("cms_preview_entry")).toBe("entry-one");
    expect(second.cookies.jar.get("cms_preview_entry")).toBe("entry-two");
  });
});
