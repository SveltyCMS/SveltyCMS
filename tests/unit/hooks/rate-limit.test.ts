/**
 * @file tests/unit/hooks/rate-limit.test.ts
 * @description handleRateLimit — bypass gates, secret gate, XFF independence, JSON/HTML 429, commerce lane.
 *
 * IS_TEST_MODE is forced false (real hook-utils for everything else) so the limiter
 * actually runs; the pressure multiplier is mocked so a handful of requests exceed
 * the IP/tenant caps instead of the 1000/10000 default window counts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@utils/hook-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/hook-utils")>();
  return {
    ...actual,
    IS_TEST_MODE: false,
    // Real getClientIp short-circuits to 127.0.0.1 when IS_TEST_MODE is true (its
    // internal closure, not our export override) — force the address-derived path.
    getClientIp: (event: any) => event.getClientAddress(),
  };
});

vi.mock("@utils/test-bypass.server", () => ({
  getMasterSecret: () => "master-secret-abc",
  timingSafeEqual: (a: string, b: string) => a === b,
}));

vi.mock("@utils/system-monitor", () => ({
  getPressureMultiplier: vi.fn(() => 1),
  shouldRejectMutations: vi.fn(() => false),
  startSystemMonitor: vi.fn(),
}));

// The tenant aggregate bucket only exists when multi-tenancy is enabled —
// single-tenant deployments skip it entirely (a shared "global" bucket was a
// site-wide 429 DoS vector). The tenant-cap test exercises the MT path.
vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn(() => true),
  getTenantIdFromHostname: vi.fn(() => "tenant-test"),
}));

import { handleRateLimit, resetRateLimitBuckets } from "@src/hooks/handle-rate-limit";
import { getPressureMultiplier, shouldRejectMutations } from "@utils/system-monitor";
import { createMockEvent, mockResolve } from "./test-utils";

const REMOTE_IP = "203.0.113.7";

function postEvent(pathname: string, opts: { ip?: string; headers?: Record<string, string> } = {}) {
  return createMockEvent(pathname, {
    method: "POST",
    ip: opts.ip ?? REMOTE_IP,
    headers: { "content-type": "application/json", ...opts.headers },
  });
}

describe("handleRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockClear();
    vi.mocked(getPressureMultiplier).mockReturnValue(1);
    vi.mocked(shouldRejectMutations).mockReturnValue(false);
    resetRateLimitBuckets();
  });

  it("skips excluded paths (setup/health/testing/favicon/well-known)", async () => {
    for (const path of [
      "/api/setup/complete",
      "/api/system/health",
      "/api/testing/seed",
      "/favicon.ico",
      "/.well-known/security.txt",
    ]) {
      const event = postEvent(path);
      const res = await handleRateLimit({ event, resolve: mockResolve as any });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBeNull(); // resolve() passthrough, no limiter headers
    }
  });

  it("skips GET/HEAD/OPTIONS (mutations only)", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
      const event = createMockEvent("/api/foo", { method, ip: REMOTE_IP });
      const res = await handleRateLimit({ event, resolve: mockResolve as any });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    }
  });

  it("never trusts a bare x-test-mode header from a remote client (no secret = no bypass)", async () => {
    const event = postEvent("/api/foo", { headers: { "x-test-mode": "true" } });
    const res = await handleRateLimit({ event, resolve: mockResolve as any });
    // Limiter ran: mutation is counted and rate-limit headers are attached
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1000");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("999");
  });

  it("does NOT bypass for a matching test secret alone (benchmark production parity)", async () => {
    // Local, no secret → limiter still runs (IS_TEST_MODE is forced false here)
    const noSecret = postEvent("/api/foo", { ip: "127.0.0.1" });
    const noSecretRes = await handleRateLimit({ event: noSecret, resolve: mockResolve as any });
    expect(noSecretRes.headers.get("X-RateLimit-Limit")).toBe("1000");

    // Local + matching x-test-secret → STILL rate limited (secret alone is not
    // a bypass — only explicit TEST_MODE environments are)
    const withSecret = postEvent("/api/foo", {
      ip: "127.0.0.1",
      headers: { "x-test-secret": "master-secret-abc" },
    });
    const withSecretRes = await handleRateLimit({ event: withSecret, resolve: mockResolve as any });
    expect(withSecretRes.status).toBe(200);
    expect(withSecretRes.headers.get("X-RateLimit-Limit")).toBe("1000");

    // Wrong secret → not bypassed either
    const wrongSecret = postEvent("/api/foo", {
      ip: "127.0.0.1",
      headers: { "x-test-secret": "wrong" },
    });
    const wrongSecretRes = await handleRateLimit({
      event: wrongSecret,
      resolve: mockResolve as any,
    });
    expect(wrongSecretRes.headers.get("X-RateLimit-Limit")).toBe("1000");
  });

  it("returns JSON 429 with RATE_LIMITED code for /api/* when the IP cap is exceeded", async () => {
    vi.mocked(getPressureMultiplier).mockReturnValue(1000); // cost 1000 → 2 requests exceed cap 1000
    const first = await handleRateLimit({
      event: postEvent("/api/foo"),
      resolve: mockResolve as any,
    });
    expect(first.status).toBe(200);

    const second = await handleRateLimit({
      event: postEvent("/api/foo"),
      resolve: mockResolve as any,
    });
    expect(second.status).toBe(429);
    expect(second.headers.get("content-type")).toContain("application/json");
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const body = await second.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.error).toBe("Too Many Requests");
    expect(body.scope).toBe("ip"); // IP 429s carry scope in the body; the header is tenant-only
  });

  it("returns an HTML 429 for browser requests (non-API path, HTML Accept)", async () => {
    vi.mocked(getPressureMultiplier).mockReturnValue(1000);
    const path = "/admin/foo";
    await handleRateLimit({ event: postEvent(path), resolve: mockResolve as any });
    const second = await handleRateLimit({
      event: postEvent(path, { headers: { Accept: "text/html" } }),
      resolve: mockResolve as any,
    });
    expect(second.status).toBe(429);
    expect(second.headers.get("content-type")).toContain("text/html");
  });

  it("tracks buckets per-IP independently (XFF does not split a real client)", async () => {
    vi.mocked(getPressureMultiplier).mockReturnValue(1000);
    // Two requests from the same real IP (regardless of XFF header) share a bucket
    const a1 = await handleRateLimit({
      event: postEvent("/api/foo", { headers: { "x-forwarded-for": "1.2.3.4" } }),
      resolve: mockResolve as any,
    });
    expect(a1.status).toBe(200);
    const a2 = await handleRateLimit({
      event: postEvent("/api/foo", { headers: { "x-forwarded-for": "9.9.9.9" } }),
      resolve: mockResolve as any,
    });
    expect(a2.status).toBe(429); // same getClientAddress → same bucket → capped

    // A different real IP has a fresh bucket
    const b = await handleRateLimit({
      event: postEvent("/api/foo", { ip: "198.51.100.9" }),
      resolve: mockResolve as any,
    });
    expect(b.status).toBe(200);
  });

  it("enforces the aggregate tenant cap across distinct IPs", async () => {
    vi.mocked(getPressureMultiplier).mockReturnValue(1000); // tenant cap 10000 → 11th request 429s
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await handleRateLimit({
        event: postEvent("/api/foo", { ip: `10.0.0.${i}` }),
        resolve: mockResolve as any,
      });
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("X-RateLimit-Scope")).toBe("tenant");
    const body = await last!.json();
    expect(body.scope).toBe("tenant");
  });

  it("rejects mutations with 503 HEAP_PRESSURE when heap is critical", async () => {
    vi.mocked(shouldRejectMutations).mockReturnValue(true);
    const res = await handleRateLimit({
      event: postEvent("/api/foo"),
      resolve: mockResolve as any,
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("HEAP_PRESSURE");
  });

  it("isolates /api/commerce mutations from the default API bucket", async () => {
    const prev = process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS;
    process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS = "2";
    try {
      const cart1 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      const cart2 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      expect(cart1.status).toBe(200);
      expect(cart1.headers.get("X-RateLimit-Lane")).toBe("commerce");
      expect(cart1.headers.get("X-RateLimit-Limit")).toBe("2");
      expect(cart2.status).toBe(200);

      const cart3 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      expect(cart3.status).toBe(429);
      expect(cart3.headers.get("X-RateLimit-Lane")).toBe("commerce");
      const body = await cart3.json();
      expect(body.code).toBe("RATE_LIMITED");
      expect(body.lane).toBe("commerce");

      const admin = await handleRateLimit({
        event: postEvent("/api/collections"),
        resolve: mockResolve as any,
      });
      expect(admin.status).toBe(200);
      expect(admin.headers.get("X-RateLimit-Lane")).toBe("default");
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS;
      else process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS = prev;
    }
  });

  it("does not spend the commerce lane when the default API bucket is exhausted", async () => {
    vi.mocked(getPressureMultiplier).mockReturnValue(1000);
    await handleRateLimit({
      event: postEvent("/api/foo"),
      resolve: mockResolve as any,
    });
    const blocked = await handleRateLimit({
      event: postEvent("/api/foo"),
      resolve: mockResolve as any,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("X-RateLimit-Lane")).toBe("default");

    vi.mocked(getPressureMultiplier).mockReturnValue(1);
    const cart = await handleRateLimit({
      event: postEvent("/api/commerce/cart"),
      resolve: mockResolve as any,
    });
    expect(cart.status).toBe(200);
    expect(cart.headers.get("X-RateLimit-Lane")).toBe("commerce");
  });

  it("charges coupon/pay/checkout more tokens than a cart mutation", async () => {
    const prev = process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS;
    process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS = "4";
    try {
      const coupon = await handleRateLimit({
        event: postEvent("/api/commerce/coupon"),
        resolve: mockResolve as any,
      });
      expect(coupon.status).toBe(200);

      const second = await handleRateLimit({
        event: postEvent("/api/commerce/coupon"),
        resolve: mockResolve as any,
      });
      expect(second.status).toBe(429);

      resetRateLimitBuckets();
      const cart1 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      const cart2 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      const cart3 = await handleRateLimit({
        event: postEvent("/api/commerce/cart"),
        resolve: mockResolve as any,
      });
      expect(cart1.status).toBe(200);
      expect(cart2.status).toBe(200);
      expect(cart3.status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS;
      else process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS = prev;
    }
  });
});
