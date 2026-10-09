/**
 * @file tests/unit/sdk/auth-media-perf.test.ts
 * @description Behavioral regression pins for the LocalCMS auth/media/safe-call
 * allocation-safety refactor. Asserts observable contracts (envelope shapes,
 * option-bag keys, filter/sort semantics, cache invalidation) — never timings.
 *
 * Features:
 * - safeCall success / AppError / plain-error / non-Error envelopes
 * - updateUserAttributes conditional options bag (no stray keys)
 * - auth adapter resolved per call (no stale handle caching)
 * - login lockout 423 envelope (ACCOUNT_LOCKED, message + code)
 * - TokensNamespace.list case-insensitive search + null-safe sort semantics
 * - MediaNamespace.move input dedup + request-cache invalidation
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => (key === "MULTI_TENANT" ? false : null)),
  getPublicSettingSync: vi.fn(() => undefined),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

// auth-namespace pulls the heavy hooks graph for cache invalidation — stub the boundaries.
vi.mock("@src/hooks/handle-authorization", () => ({
  invalidateRolesCache: vi.fn(),
}));
vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
  invalidateUserSessionCaches: vi.fn(),
}));
vi.mock("@src/hooks/handle-turbo-get", () => ({
  clearTurboAuthCache: vi.fn(),
  invalidateTurboAuthForUser: vi.fn(),
}));
vi.mock("@src/databases/auth/sso-session", () => ({
  deleteSsoSessionMetadata: vi.fn(),
}));
vi.mock("@utils/server/layout-caches.server", () => ({
  invalidateLayoutUserCache: vi.fn(async () => undefined),
}));

// Keep the media namespace test focused on namespace logic, not the media pipeline.
vi.mock("@utils/media/media-service.server", () => ({
  MediaService: class {
    enrichMediaWithUrl(item: any, prefix?: string) {
      return { ...item, url: `${prefix ?? ""}${item.path ?? item.url ?? ""}` };
    }
  },
}));

import { safeCall } from "@src/services/sdk/safe-call";
import { AuthNamespace } from "@src/services/sdk/namespaces/auth-namespace";
import { MediaNamespace } from "@src/services/sdk/namespaces/media-namespace";
import { AppError } from "@utils/error-handling";
import { createSystemTenantScope } from "@src/databases/system-tenant-scope";
import { dateToISODateString } from "@src/utils/date";

describe("safeCall — envelope contracts", () => {
  it("resolves to the success envelope", async () => {
    const result = await safeCall(async () => 42);
    expect(result).toEqual({ success: true, data: 42 });
  });

  it("maps AppError to a code/message/statusCode envelope", async () => {
    const result = await safeCall(async () => {
      throw new AppError("nope", 423, "ACCOUNT_LOCKED");
    });
    expect(result).toEqual({
      success: false,
      message: "nope",
      error: { code: "ACCOUNT_LOCKED", message: "nope", statusCode: 423 },
    });
  });

  it("wraps plain errors with the context prefix and the raw error instance", async () => {
    const boom = new Error("boom");
    const result = await safeCall(async () => {
      throw boom;
    }, "ctx");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toBe("ctx: boom");
    expect(result.error).toBe(boom);
  });

  it("stringifies non-Error throws", async () => {
    const result = await safeCall(async () => {
      throw "raw";
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toBe("raw");
    expect(result.error).toBe("raw");
  });
});

describe("AuthNamespace — allocation-safe refactor contracts", () => {
  it("updateUserAttributes sends exactly the conditional option keys", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const auth = {
      updateUserAttributes: vi.fn(
        async (_id: string, _data: unknown, opts: Record<string, unknown>) => {
          captured.push(opts);
          return { success: true, data: { _id } };
        },
      ),
    };
    const ns = new AuthNamespace({ auth } as any);

    await ns.updateUserAttributes("u1", { username: "x" }, { tenantId: "t1" as any });
    expect(captured[0]).toEqual({ tenantId: "t1" });

    // Empty-string tenant is treated as "missing" — no stray key on the bag.
    await ns.updateUserAttributes("u1", { username: "y" }, { tenantId: "" as any });
    expect(captured[1]).toEqual({});

    await ns.updateUserAttributes(
      "u1",
      { role: "editor" },
      {
        tenantId: "t1" as any,
        allowPrivilegeEscalation: true,
      },
    );
    expect(captured[2]).toEqual({ tenantId: "t1", allowPrivilegeEscalation: true });

    const scope = createSystemTenantScope("testing");
    await ns.updateUserAttributes("u1", { username: "z" }, { systemScope: scope });
    expect(captured[3]).toEqual({ systemScope: scope });
  });

  it("resolves the adapter auth per call instead of caching a stale handle", async () => {
    const first = { deleteUser: vi.fn(async () => ({ success: true, data: undefined })) };
    const adapter: Record<string, unknown> = { auth: first };
    const ns = new AuthNamespace(adapter as any);

    await ns.deleteUser("u1", { tenantId: "t1" as any });

    const second = { deleteUser: vi.fn(async () => ({ success: true, data: undefined })) };
    adapter.auth = second;
    await ns.deleteUser("u2", { tenantId: "t1" as any });

    expect(first.deleteUser).toHaveBeenCalledTimes(1);
    expect(second.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("login keeps the 423 lockout envelope for a locked account", async () => {
    const lockoutUntil = dateToISODateString(new Date(Date.now() + 15 * 60 * 1000));
    const createSession = vi.fn(async () => ({ success: true, data: {} }));
    const auth = {
      getUserByEmail: vi.fn(async () => ({
        success: true,
        data: {
          _id: "locked-user",
          email: "locked@test.dev",
          lockoutUntil,
          failedAttempts: 0,
          blocked: false,
          password: "argon2-hash",
        },
      })),
      createSession,
    };
    const ns = new AuthNamespace({ auth } as any);

    const result = await ns.login(
      { email: "locked@test.dev", password: "guess" },
      { tenantId: null },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toMatch(/Account is temporarily locked/);
    expect(result.error).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("list filters tokens case-insensitively and keeps the desc null-last order", async () => {
    const getAllTokens = vi.fn(async () => ({
      success: true,
      data: [
        { email: "bob@test.dev", token: "tok-bob", createdAt: "2026-01-02" },
        { email: "alice@test.dev", token: "tok-alice", createdAt: undefined },
        { email: "carol@test.dev", token: "tok-carol", createdAt: "2026-01-01" },
      ],
    }));
    const ns = new AuthNamespace({ auth: { getAllTokens } } as any);

    const searched = await ns.tokens.list({ tenantId: "t1" as any, search: "BOB" });
    expect(searched.success).toBe(true);
    if (!searched.success) return;
    expect(searched.data.map((t: any) => t.email)).toEqual(["bob@test.dev"]);

    const sorted = await ns.tokens.list({
      tenantId: "t1" as any,
      sort: "createdAt",
      order: "desc",
    });
    expect(sorted.success).toBe(true);
    if (!sorted.success) return;
    expect(sorted.data.map((t: any) => t.email)).toEqual([
      "bob@test.dev",
      "carol@test.dev",
      "alice@test.dev",
    ]);
  });
});

describe("MediaNamespace — dedup + cache invalidation contracts", () => {
  it("move dedups ids in order without mutating the input", async () => {
    const move = vi.fn(async () => ({ success: true, data: { movedCount: 2 } }));
    const ns = new MediaNamespace({
      type: "sqlite",
      media: { files: { move } },
    } as any);

    const input = ["a", "b", "a", "", "b"];
    const result = await ns.move(input, null, { tenantId: "t1" as any });
    expect(result.success).toBe(true);
    expect(move).toHaveBeenCalledWith(["a", "b"], null, { tenantId: "t1" });
    expect(input).toEqual(["a", "b", "a", "", "b"]);
  });

  it("findById refetches after a move invalidates the request cache", async () => {
    const move = vi.fn(async () => ({ success: true, data: { movedCount: 1 } }));
    const findOne = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { _id: "f1", path: "/p/1.png" } })
      .mockResolvedValueOnce({ success: true, data: { _id: "f1", path: "/p/2.png" } });
    const ns = new MediaNamespace({
      type: "sqlite",
      media: { files: { move } },
      crud: { findOne },
    } as any);

    const first = await ns.findById("f1", { tenantId: "t1" as any });
    const cached = await ns.findById("f1", { tenantId: "t1" as any });
    expect(findOne).toHaveBeenCalledTimes(1);
    expect((first as any).data.path).toBe("/p/1.png");
    expect((cached as any).data.path).toBe("/p/1.png");

    await ns.move(["f1"], "folder-x", { tenantId: "t1" as any });

    const refetched = await ns.findById("f1", { tenantId: "t1" as any });
    expect(findOne).toHaveBeenCalledTimes(2);
    expect((refetched as any).data.path).toBe("/p/2.png");
  });
});
