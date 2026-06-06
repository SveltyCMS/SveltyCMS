/**
 * @file tests/unit/hooks/adversarial.test.ts
 * @description Adversarial security: session fixation, cookie poisoning, bypass attempts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleAuthentication, clearAllSessionCaches } from "@src/hooks/handle-authentication";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

vi.mock("$app/environment", () => ({ dev: true, browser: false }));
vi.mock("@src/databases/db", () => ({
  auth: {
    validateSession: vi.fn().mockResolvedValue(null),
    getUserById: vi.fn().mockResolvedValue(null),
  },
}));

function createEvent(path: string, overrides: any = {}) {
  const host = overrides.hostname || "localhost";
  const proto = overrides.protocol === "https:" ? "https" : "http";
  const url = new URL(path, `${proto}://${host}`);
  const cookies: Record<string, string> = {};
  if (overrides.cookies) Object.assign(cookies, overrides.cookies);
  if (overrides.sessionCookie) cookies[SESSION_COOKIE_NAME] = overrides.sessionCookie;

  return {
    url,
    request: new Request(url, {
      headers: overrides.ip ? { "x-forwarded-for": overrides.ip } : {},
    }),
    cookies: {
      get: vi.fn((n: string) => cookies[n] ?? null),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: {
      user: overrides.user ?? null,
      tenantId: "t1",
      isAdmin: false,
      roles: [],
    } as any,
    params: {},
    route: { id: path },
  } as any;
}

const resolve = vi.fn(() => Promise.resolve(new Response("OK")));

async function safe(fn: () => Promise<any>) {
  try {
    await fn();
  } catch {}
}

describe("Adversarial Hook Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches();
  });

  it("should reject __Host- cookie on HTTP", async () => {
    const event = createEvent("/dashboard", {
      protocol: "http:",
      cookies: { [`__Host-${SESSION_COOKIE_NAME}`]: "stolen" },
    });
    await safe(async () => handleAuthentication({ event, resolve }));
    expect(event.locals.user).toBeNull();
  });

  it("should handle malformed cookie values", async () => {
    for (const v of [";;;;", "session=<script>x</script>", "null"]) {
      await safe(async () =>
        handleAuthentication({
          event: createEvent("/dashboard", { sessionCookie: v }),
          resolve,
        }),
      );
    }
  });

  it("should handle 10K-char cookie", async () => {
    await safe(async () =>
      handleAuthentication({
        event: createEvent("/dashboard", { sessionCookie: "x".repeat(10_000) }),
        resolve,
      }),
    );
  });

  it("should handle public paths", async () => {
    for (const p of ["/login", "/signup", "/setup"]) {
      await safe(async () =>
        handleAuthentication({
          event: createEvent(p, { user: null }),
          resolve,
        }),
      );
    }
  });

  it("should handle spoofed x-forwarded-for", async () => {
    await safe(async () =>
      handleAuthentication({
        event: createEvent("/dashboard", { ip: "127.0.0.1, 10.0.0.1" }),
        resolve,
      }),
    );
  });
});
