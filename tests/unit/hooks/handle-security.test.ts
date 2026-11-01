/**
 * @file tests/unit/hooks/handle-security.test.ts
 * @description Real behaviour of the unified security middleware.
 *
 * `handle-security.ts` had 0% coverage: heap load-shedding, WAF wiring, the
 * GraphQL depth/complexity gate, honeypot/bot decoys, the form replay guard,
 * and the allow/block/challenge decision were only exercised through E2E.
 *
 * Only the surrounding boundaries (heap sample, WAF verdict, threat scanner,
 * security-response service, settings) are mocked; the middleware, its guards
 * and `handleApiError` run for real.
 *
 * ### Features:
 * - bypass / bootstrap / local-test-mode short circuits
 * - 503 mutation load-shedding above 95% heap
 * - WAF block, block/challenge/allow verdicts
 * - honeypot + bot decoys and forensics
 * - GraphQL length, depth, and AST-complexity limits (POST and GET)
 * - form submission replay protection (urlencoded + multipart)
 * - resolve-thrown AppError mapped to API JSON vs SvelteKit error
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUBMISSION_GUARD_HEADER,
  clearSubmissionReplayCache,
  generateSubmissionId,
} from "@utils/security/submission-guard";

const h = vi.hoisted(() => {
  const analyzeRequest = vi.fn(async (): Promise<{ action: string; reason?: string }> => ({
    action: "allow",
  }));
  const blockIp = vi.fn(async () => {});
  const incrementSecurityViolations = vi.fn();
  return {
    state: {
      testMode: false,
      heapRatio: 0.1,
      wafBlocked: false,
      wafReason: "WAF policy violation",
      bot: false,
      honeypot: false,
      ip: "203.0.113.9",
    },
    analyzeRequest,
    blockIp,
    incrementSecurityViolations,
  };
});

vi.mock("@utils/heap-pressure", () => ({
  getHeapUsedRatio: () => h.state.heapRatio,
}));

vi.mock("@src/services/security/threat-scan", () => ({
  isAiOrScannerBot: () => h.state.bot,
  isHoneypotPath: () => h.state.honeypot,
}));

vi.mock("@utils/hook-utils", () => ({
  get IS_TEST_MODE() {
    return h.state.testMode;
  },
  getClientIp: () => h.state.ip,
}));

vi.mock("@utils/tenant", () => ({ getTenantIdFromHostname: () => undefined }));
vi.mock("@utils/tenant-isolation.server", () => ({ isMultiTenantEnabled: () => false }));

vi.mock("@src/hooks/handle-waf-guard", () => ({
  wafGuard: {
    inspectEvent: () =>
      h.state.wafBlocked
        ? { blocked: true, reason: h.state.wafReason, threatType: "injection" }
        : { blocked: false },
  },
}));

vi.mock("@src/services/security/response-service", () => ({
  securityResponseService: {
    analyzeRequest: h.analyzeRequest,
    blockIp: h.blockIp,
  },
}));

vi.mock("@src/services/observability/metrics-service", () => ({
  metricsService: { incrementSecurityViolations: h.incrementSecurityViolations },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => (key === "DEMO" ? false : undefined),
}));

import { handleSecurity } from "@src/hooks/handle-security";
import { AppError } from "@utils/error-handling";

interface EventInit {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  locals?: Record<string, unknown>;
}

function makeEvent({
  url = "https://cms.test/api/content",
  method = "GET",
  headers = {},
  body = null,
  locals = {},
}: EventInit = {}) {
  const request = new Request(url, { method, headers, body });
  return { request, url: new URL(url), locals } as any;
}

function okResolve() {
  return vi.fn(async () => new Response("resolved", { status: 200 }));
}

// The resolver may be a bare mock (okResolve) or a mock that inspects the event,
// so the parameter stays open here - this is a test helper, not the hook contract.
async function run(
  eventInit: EventInit = {},
  resolve: any = okResolve(),
): Promise<{ response: Response | null; error: any; resolve: any }> {
  try {
    const response = await handleSecurity({ event: makeEvent(eventInit), resolve } as any);
    return { response, error: null, resolve };
  } catch (error) {
    return { response: null, error, resolve };
  }
}

beforeEach(() => {
  h.state.testMode = false;
  h.state.heapRatio = 0.1;
  h.state.wafBlocked = false;
  h.state.bot = false;
  h.state.honeypot = false;
  h.state.ip = "203.0.113.9";

  h.analyzeRequest.mockReset();
  h.analyzeRequest.mockResolvedValue({ action: "allow" });
  h.blockIp.mockReset();
  h.blockIp.mockResolvedValue(undefined);
  h.incrementSecurityViolations.mockReset();

  clearSubmissionReplayCache();
});

describe("handleSecurity — short circuits", () => {
  it("honours the internal test bypass", async () => {
    const { response, resolve } = await run({ locals: { __testBypass: true } });
    expect(response?.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(h.analyzeRequest).not.toHaveBeenCalled();
  });

  it("skips bootstrap/system routes", async () => {
    const { response, resolve } = await run({ locals: { __flags: { isBootstrap: true } } });
    expect(response?.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("skips the chain for local traffic in explicit test mode", async () => {
    h.state.testMode = true;
    h.state.ip = "127.0.0.1";

    const { response, resolve } = await run();
    expect(response?.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(h.analyzeRequest).not.toHaveBeenCalled();
  });

  it("does NOT skip local traffic when the caller forces security", async () => {
    h.state.testMode = true;
    h.state.ip = "127.0.0.1";

    const { response, resolve } = await run({ headers: { "x-test-security": "true" } });
    expect(response?.status).toBe(200);
    expect(h.analyzeRequest).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("handleSecurity — load shedding", () => {
  it("rejects mutations above 95% heap and allows reads", async () => {
    h.state.heapRatio = 0.97;

    const mutation = await run({
      url: "https://cms.test/api/content",
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(mutation.response?.status).toBe(503);
    expect(mutation.response?.headers.get("Retry-After")).toBe("30");
    expect(await mutation.response?.text()).toContain("Mutations temporarily disabled");
    expect(mutation.resolve).not.toHaveBeenCalled();

    const read = await run({ url: "https://cms.test/api/content" });
    expect(read.response?.status).toBe(200);
    expect(read.resolve).toHaveBeenCalledTimes(1);
  });

  it("keeps system and setup routes available under pressure", async () => {
    h.state.heapRatio = 0.99;

    const health = await run({
      url: "https://cms.test/api/system/health",
      method: "POST",
      body: "{}",
    });
    expect(health.response?.status).toBe(200);
    expect(health.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("handleSecurity — WAF and verdicts", () => {
  it("returns a structured 400 when the WAF blocks", async () => {
    h.state.wafBlocked = true;

    const { response, resolve } = await run();
    expect(response?.status).toBe(400);
    expect(h.incrementSecurityViolations).toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("maps a security block to 403 on API routes", async () => {
    h.analyzeRequest.mockResolvedValueOnce({ action: "block", reason: "blocked ip" });

    const { response, resolve } = await run({ url: "https://cms.test/api/content" });
    expect(response?.status).toBe(403);
    expect(await response?.text()).toContain("blocked ip");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("maps a challenge to 429", async () => {
    h.analyzeRequest.mockResolvedValueOnce({ action: "challenge", reason: "slow down" });

    const { response } = await run({ url: "https://cms.test/api/content" });
    expect(response?.status).toBe(429);
  });

  it("throws a SvelteKit error for a blocked page route", async () => {
    h.analyzeRequest.mockResolvedValueOnce({ action: "block", reason: "blocked" });

    const { error } = await run({ url: "https://cms.test/dashboard" });
    expect(error?.status).toBe(403);
  });

  it("resolves when the verdict is allow", async () => {
    const { response, resolve } = await run();
    expect(response?.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("handleSecurity — honeypot and bot decoys", () => {
  it("returns an empty 200 decoy, records forensics, and blocks the IP", async () => {
    h.state.honeypot = true;

    const { response, resolve } = await run({ url: "https://cms.test/.env" });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await response?.text()).toBe("");
    expect(h.analyzeRequest).toHaveBeenCalledTimes(1);
    expect(h.blockIp).toHaveBeenCalledWith(
      h.state.ip,
      expect.stringContaining("Honeypot"),
      undefined,
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns the decoy for a scanner bot but does not block the IP", async () => {
    h.state.bot = true;

    const { response, resolve } = await run({ url: "https://cms.test/" });
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("");
    expect(h.analyzeRequest).toHaveBeenCalledTimes(1);
    expect(h.blockIp).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("handleSecurity — GraphQL limits", () => {
  it("rejects an oversized POST body before parsing", async () => {
    const { response, resolve } = await run({
      url: "https://cms.test/api/graphql",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "x".repeat(102_401) }),
    });

    expect(response?.status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a deeply nested POST query via the O(n) pre-filter", async () => {
    const query = `{ ${"a { ".repeat(13)}id ${"} ".repeat(13)}}`;
    const { response } = await run({
      url: "https://cms.test/api/graphql",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });

    expect(response?.status).toBe(400);
  });

  it("parses the AST and rejects a high-multiplier query", async () => {
    const query = "{ users(first: 2000) { profile { team { org { name } } } } }";
    const event = makeEvent({
      url: "https://cms.test/api/graphql",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const response = await handleSecurity({ event, resolve: okResolve() } as any);
    expect(response.status).toBe(400);
    expect(event.locals.__graphqlAst).toBeTruthy();
    expect(event.locals.__graphqlBodyText).toContain("users");
  });

  it("applies the same complexity gate to GET queries", async () => {
    const query = `{ ${"a { ".repeat(13)}id ${"} ".repeat(13)}}`;
    const { response } = await run({
      url: `https://cms.test/api/graphql?query=${encodeURIComponent(query)}`,
    });

    expect(response?.status).toBe(400);
  });
});

describe("handleSecurity — form replay guard", () => {
  // The wire contract, spelled out literally on purpose: renaming either channel
  // must break this suite, not silently change what clients have to send.
  const TOKEN_PARAM = "_sub_token";
  const FORM = { "content-type": "application/x-www-form-urlencoded" };

  it("ignores _id in the URL: two submits of one form are both served", async () => {
    const id = generateSubmissionId();
    const init: EventInit = {
      url: `https://cms.test/login?_id=${id}`,
      method: "POST",
      headers: FORM,
      body: "email=a%40b.com",
    };

    const first = await run(init);
    expect(first.response?.status).toBe(200);
    expect(first.resolve).toHaveBeenCalledTimes(1);

    // `_id` is a record id everywhere in SveltyCMS. The guard must not read it as
    // a token, so the second submit is not a replay either.
    const second = await run(init);
    expect(second.response?.status).toBe(200);
    expect(second.resolve).toHaveBeenCalledTimes(1);
    expect(h.incrementSecurityViolations).not.toHaveBeenCalled();
  });

  it("lets a payload _id through (collection builder saveCollection)", async () => {
    // CB1: the builder posts its collection id as `_id`. That is payload, not a
    // submission token, so the request must reach the action untouched - twice.
    const init: EventInit = {
      url: "https://cms.test/config/collectionbuilder/edit/posts?/saveCollection",
      method: "POST",
      headers: FORM,
      body: "_id=posts&name=posts&originalName=posts",
    };

    for (const attempt of [1, 2]) {
      const { response, resolve } = await run(init);
      expect(response?.status, `save attempt ${attempt}`).toBe(200);
      expect(resolve).toHaveBeenCalledTimes(1);
    }
    expect(h.incrementSecurityViolations).not.toHaveBeenCalled();
  });

  it("does not read the body on either token channel, and the action still sees its _id", async () => {
    const formDataSpy = vi.spyOn(Request.prototype, "formData");
    const cloneSpy = vi.spyOn(Request.prototype, "clone");
    const formData = new FormData();
    formData.set("_id", "posts");
    formData.set("name", "AuditNotes");

    // Body reads made BEFORE the action runs: the guard must contribute none.
    const bodyReadsBeforeAction: number[][] = [];
    let actionId: unknown = null;
    const resolve = vi.fn(async (event: any) => {
      bodyReadsBeforeAction.push([formDataSpy.mock.calls.length, cloneSpy.mock.calls.length]);
      actionId = (await event.request.formData()).get("_id");
      return new Response("resolved", { status: 200 });
    });

    const token = generateSubmissionId();
    const init: EventInit = {
      url: `https://cms.test/config/collectionbuilder/new?/saveCollection&${TOKEN_PARAM}=${token}`,
      method: "POST",
      body: formData,
    };

    try {
      const { response } = await run(init, resolve);

      expect(response?.status).toBe(200);
      expect(resolve).toHaveBeenCalledTimes(1);
      // Zero body parsing in the guard - not even a clone - so the multipart
      // body reaches the action untouched.
      expect(bodyReadsBeforeAction).toEqual([[0, 0]]);
      expect(actionId).toBe("posts");

      // The token was consumed, so the second POST is a replay: proof that the
      // guard really did engage above (and not just skip the whole branch).
      const replay = await run(init);
      expect(replay.response?.status).toBe(429);
      expect(replay.resolve).not.toHaveBeenCalled();
    } finally {
      formDataSpy.mockRestore();
      cloneSpy.mockRestore();
    }
  });
  it("engages on _sub_token and rejects the replay with Retry-After", async () => {
    const id = generateSubmissionId();
    const init: EventInit = {
      url: `https://cms.test/login?${TOKEN_PARAM}=${id}`,
      method: "POST",
      headers: FORM,
      body: "email=a%40b.com",
    };

    const first = await run(init);
    expect(first.response?.status).toBe(200);
    expect(first.resolve).toHaveBeenCalledTimes(1);

    const replay = await run(init);
    expect(replay.response?.status).toBe(429);
    expect(replay.response?.headers.get("Retry-After")).toBe("60");
    expect(await replay.response?.text()).toContain("Duplicate form submission");
    expect(replay.resolve).not.toHaveBeenCalled();
    expect(h.incrementSecurityViolations).toHaveBeenCalledTimes(1);
  });

  it("engages on the X-Submission-Guard header and rejects the replay", async () => {
    const id = generateSubmissionId();
    const init: EventInit = {
      url: "https://cms.test/login",
      method: "POST",
      headers: { ...FORM, [SUBMISSION_GUARD_HEADER]: id },
      body: "email=a%40b.com",
    };

    const first = await run(init);
    expect(first.response?.status).toBe(200);
    expect(first.resolve).toHaveBeenCalledTimes(1);

    const replay = await run(init);
    expect(replay.response?.status).toBe(429);
    expect(replay.response?.headers.get("Retry-After")).toBe("60");
    expect(replay.resolve).not.toHaveBeenCalled();
  });

  it("rejects a declared but malformed token instead of treating it as payload", async () => {
    const malformedParam = await run({
      url: `https://cms.test/login?${TOKEN_PARAM}=not-a-uuid`,
      method: "POST",
      headers: FORM,
      body: "email=a%40b.com",
    });
    expect(malformedParam.response?.status).toBe(400);
    expect(malformedParam.resolve).not.toHaveBeenCalled();

    const emptyParam = await run({
      url: `https://cms.test/login?${TOKEN_PARAM}=`,
      method: "POST",
      headers: FORM,
      body: "email=a%40b.com",
    });
    expect(emptyParam.response?.status).toBe(400);
    expect(emptyParam.resolve).not.toHaveBeenCalled();

    const malformedHeader = await run({
      url: "https://cms.test/login",
      method: "POST",
      headers: { ...FORM, [SUBMISSION_GUARD_HEADER]: "1" },
      body: "email=a%40b.com",
    });
    expect(malformedHeader.response?.status).toBe(400);
    expect(malformedHeader.resolve).not.toHaveBeenCalled();
  });

  it("does not collide when two routes use the same token", async () => {
    const id = generateSubmissionId();
    const login: EventInit = {
      url: `https://cms.test/login?${TOKEN_PARAM}=${id}`,
      method: "POST",
      headers: FORM,
      body: "email=a%40b.com",
    };
    const register: EventInit = {
      url: `https://cms.test/register?${TOKEN_PARAM}=${id}`,
      method: "POST",
      headers: FORM,
      body: "email=c%40d.com",
    };

    // Same client-generated token, different form: the replay cache is keyed per
    // tenant+route, so neither submission is a replay of the other.
    expect((await run(login)).response?.status).toBe(200);
    expect((await run(register)).response?.status).toBe(200);
    // The second submit of the SAME form is still a replay.
    expect((await run(login)).response?.status).toBe(429);
  });
});

describe("handleSecurity — resolve errors", () => {
  it("maps a resolve AppError to a structured API response", async () => {
    const resolve = vi.fn(async () => {
      throw new AppError("boom", 500);
    });

    const { response } = await run({ url: "https://cms.test/api/content" }, resolve);
    expect(response?.status).toBe(500);
    expect(await response?.text()).toContain("boom");
  });

  it("rethrows a page AppError as a SvelteKit error", async () => {
    const resolve = vi.fn(async () => {
      throw new AppError("page boom", 500);
    });

    const { error } = await run({ url: "https://cms.test/dashboard" }, resolve);
    expect(error?.status).toBe(500);
    expect(error?.message).toContain("page boom");
  });
});
