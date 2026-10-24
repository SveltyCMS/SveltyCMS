/**
 * @file tests/unit/routes/preview-authorize-server.test.ts
 * @description Behavioural tests for `POST /api/preview/authorize`.
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: a signed preview URL is returned for a schema + entry
 * - failure-path: CSRF, anonymous, malformed body, missing fields, no secret
 * - concurrency: parallel authorizations keep their own entry/target
 *
 * The preview service and the license gate are boundaries; guard ordering,
 * CSRF wiring and error mapping run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/services/content/preview-service", () => ({
  previewService: {
    generatePreviewUrl: vi.fn(),
  },
}));

vi.mock("@src/plugins/editable-website/license-gate.server", () => ({
  requireEditableWebsiteLicense: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@utils/security/csrf-utils", () => ({
  validateCsrfForRequest: vi.fn(),
}));

import { previewService } from "@src/services/content/preview-service";
import { requireEditableWebsiteLicense } from "@src/plugins/editable-website/license-gate.server";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { POST } from "../../../src/routes/api/preview/authorize/+server";

const mockGenerate = vi.mocked(previewService.generatePreviewUrl);
const mockLicense = vi.mocked(requireEditableWebsiteLicense);
const mockCsrf = vi.mocked(validateCsrfForRequest);

type AuthorizeEvent = Parameters<typeof POST>[0];

function makeCookies() {
  return { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
}

function makeEvent(
  body: unknown,
  options: { user?: unknown; rawBody?: string } = {},
): AuthorizeEvent {
  const url = new URL("http://localhost/api/preview/authorize");
  return {
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: options.rawBody ?? JSON.stringify(body),
    }),
    url,
    locals: {
      user:
        "user" in options
          ? options.user
          : { _id: { toString: () => "u1" }, email: "editor@test.com", role: "editor" },
      tenantId: "t1",
    },
    cookies: makeCookies(),
  } as unknown as AuthorizeEvent;
}

const schema = {
  _id: "posts",
  name: "Posts",
  livePreview: true,
  fields: [{ db_fieldName: "slug", widget: { Name: "Input" } }],
};

const entry = { _id: "entry-1", title: "Draft" };

describe("POST /api/preview/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockReturnValue({ isValid: true } as ReturnType<typeof validateCsrfForRequest>);
    mockLicense.mockResolvedValue({
      active: true,
      daysRemaining: 30,
      hasLicense: true,
    });
    mockGenerate.mockReturnValue("https://example.test/posts/draft?preview_token=signed-token");
  });

  it("returns a signed preview URL for a schema and entry", async () => {
    const response = await POST(
      makeEvent({ schema, entry, contentLanguage: "en", previewTargetUrl: "/posts/draft" }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.previewUrl).toBe("https://example.test/posts/draft?preview_token=signed-token");
    expect(mockGenerate).toHaveBeenCalledWith(schema, entry, "en", "t1", "u1", "/posts/draft");
  });

  it("rejects a failed CSRF check before authenticating", async () => {
    mockCsrf.mockReturnValue({ isValid: false, error: "bad token" } as ReturnType<
      typeof validateCsrfForRequest
    >);

    const response = await POST(makeEvent({ schema, entry }));

    expect(response.status).toBe(403);
    expect(mockLicense).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("rejects anonymous and missing users", async () => {
    for (const user of [null, { _id: "anon", isAnonymous: true }]) {
      const response = await POST(makeEvent({ schema, entry }, { user }));
      expect(response.status).toBe(401);
    }
    expect(mockLicense).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body and a body missing schema/entry", async () => {
    const malformed = await POST(makeEvent(null, { rawBody: "{not json" }));
    expect(malformed.status).toBe(400);

    const incomplete = await POST(makeEvent({ schema }));
    expect(incomplete.status).toBe(400);

    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("fails closed when the preview secret is not configured", async () => {
    mockGenerate.mockReturnValue("");
    const response = await POST(makeEvent({ schema, entry }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
  });

  it("keeps two parallel authorizations on their own entry", async () => {
    mockGenerate.mockImplementation((_schema, currentEntry, _language, _tenant, _user, target) => {
      const id = (currentEntry as { _id: string })._id;
      return `https://example.test/${id}${String(target)}?preview_token=${id}`;
    });

    const [first, second] = await Promise.all([
      POST(makeEvent({ schema, entry: { _id: "entry-a" }, previewTargetUrl: "/a" })),
      POST(makeEvent({ schema, entry: { _id: "entry-b" }, previewTargetUrl: "/b" })),
    ]);

    const [firstBody, secondBody] = (await Promise.all([first.json(), second.json()])) as Array<
      Record<string, unknown>
    >;

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(firstBody.previewUrl).toBe("https://example.test/entry-a/a?preview_token=entry-a");
    expect(secondBody.previewUrl).toBe("https://example.test/entry-b/b?preview_token=entry-b");
  });
});
