/**
 * @file tests/unit/hooks/authorization-test-mode-gate.test.ts
 * @description H7 regression: a stray `VITE_TEST_MODE=true` must NOT disable
 * `/api` authorization on a production server.
 *
 * `VITE_`-prefixed variables are exposed to the client bundle by Vite convention, so
 * operators set them for frontend work. The authorization hook used to re-derive
 * `IS_TEST_MODE` from `TEST_MODE`/`VITE_TEST_MODE` with no production guard and
 * early-returned for every `/api` path, skipping `checkEndpointPermission` and
 * `checkMfaRequirement`. It now imports the production-gated flag from
 * `@utils/hook-utils`, which requires `TEST_API_SECRET` (or an explicit
 * `ALLOW_TEST_MODE_IN_PROD=true`) whenever `NODE_ENV=production`.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: { validateSession: vi.fn(), getAllRoles: vi.fn().mockResolvedValue([]) },
    collection: { getModel: vi.fn() },
  },
  getDb: vi.fn().mockReturnValue({
    auth: { validateSession: vi.fn(), getAllRoles: vi.fn().mockResolvedValue([]) },
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  auth: new Proxy({}, { get: () => undefined }),
}));

vi.mock("$app/environment", () => ({
  browser: false,
  dev: false,
}));

const ENV_KEYS = [
  "NODE_ENV",
  "TEST_MODE",
  "VITE_TEST_MODE",
  "PLAYWRIGHT_TEST",
  "TEST_API_SECRET",
  "ALLOW_TEST_MODE_IN_PROD",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("authorization hook — production test-mode gate", () => {
  it("does not bypass /api authorization when VITE_TEST_MODE=true and no test secret", async () => {
    const saved = snapshotEnv();
    try {
      process.env.NODE_ENV = "production";
      process.env.VITE_TEST_MODE = "true";
      delete process.env.TEST_MODE;
      delete process.env.PLAYWRIGHT_TEST;
      delete process.env.TEST_API_SECRET;
      delete process.env.ALLOW_TEST_MODE_IN_PROD;

      vi.resetModules();
      const { handleAuthorization } = await import("@src/hooks/handle-authorization");

      const event = {
        url: new URL("http://localhost/api/collections"),
        request: new Request("http://localhost/api/collections"),
        locals: { user: null, roles: [], cms: { context: { isLocal: false } } },
        cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      } as unknown as RequestEvent;
      const resolve = vi.fn().mockResolvedValue(new Response("bypassed"));

      const response = await handleAuthorization({ event, resolve } as never);

      // Test-mode pass-through would have called resolve() and returned its body.
      expect(resolve).not.toHaveBeenCalled();
      expect((response as Response).status).toBe(401);
    } finally {
      restoreEnv(saved);
      vi.resetModules();
    }
  });

  it("still bypasses /api authorization in a production harness that carries TEST_API_SECRET", async () => {
    const saved = snapshotEnv();
    try {
      process.env.NODE_ENV = "production";
      process.env.VITE_TEST_MODE = "true";
      delete process.env.TEST_MODE;
      delete process.env.PLAYWRIGHT_TEST;
      process.env.TEST_API_SECRET = "harness-secret";
      delete process.env.ALLOW_TEST_MODE_IN_PROD;

      vi.resetModules();
      const { handleAuthorization } = await import("@src/hooks/handle-authorization");

      const event = {
        url: new URL("http://localhost/api/collections"),
        request: new Request("http://localhost/api/collections"),
        locals: { user: null, roles: [], cms: { context: { isLocal: false } } },
        cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      } as unknown as RequestEvent;
      const resolve = vi.fn().mockResolvedValue(new Response("ok"));

      const response = await handleAuthorization({ event, resolve } as never);

      expect(resolve).toHaveBeenCalled();
      expect(await (response as Response).text()).toBe("ok");
    } finally {
      restoreEnv(saved);
      vi.resetModules();
    }
  });
});
