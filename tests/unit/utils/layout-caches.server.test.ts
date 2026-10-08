/**
 * @file tests/unit/utils/layout-caches.server.test.ts
 * @description Unit tests for layout L1 caches + single-flight guards (src/utils/server/layout-caches.server.ts).
 *
 * Features:
 * - single-flight: concurrent misses for the same user/tenant share one DB read
 * - tenant-scoped flight keys
 * - invalidation clears both the L1 entry and the in-flight entry
 * - identity-guarded flight cleanup (a settled old flight never clobbers a newer one)
 * - graceful fallback to session snapshot / plugin metadata defaults
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@src/databases/auth/types";
import { cacheService } from "@src/databases/cache/cache-service";

const dbAuthMock = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
}));
const registryMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  getAllPluginStates: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({ auth: dbAuthMock }));
vi.mock("@src/plugins/registry", () => ({ pluginRegistry: registryMock }));

type LayoutCaches = typeof import("@utils/server/layout-caches.server");

const sessionUser = { _id: "u1", email: "a@b.c" } as unknown as User;

// The module keeps module-scoped in-flight maps; re-import it per test so a
// failed/aborted test can never leak a pending flight into the next one.
let layoutCaches: LayoutCaches;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  dbAuthMock.getUserById.mockReset();
  dbAuthMock.getUserByEmail.mockReset();
  registryMock.getAll.mockReset();
  registryMock.getAllPluginStates.mockReset();
  // Default cache state: cold L1.
  (cacheService.getSync as any).mockReturnValue(null);
  layoutCaches = await import("@utils/server/layout-caches.server");
});

describe("getFreshLayoutUser", () => {
  it("returns null without any cache or DB work when there is no session user", async () => {
    await expect(layoutCaches.getFreshLayoutUser(null, "t1")).resolves.toBeNull();
    expect(cacheService.getSync).not.toHaveBeenCalled();
    expect(dbAuthMock.getUserById).not.toHaveBeenCalled();
  });

  it("returns the session snapshot when the user id is empty", async () => {
    const anonymous = { _id: "" } as unknown as User;
    await expect(layoutCaches.getFreshLayoutUser(anonymous, "t1")).resolves.toBe(anonymous);
    expect(dbAuthMock.getUserById).not.toHaveBeenCalled();
  });

  it("single-flights concurrent misses for the same user into one DB read", async () => {
    let resolveRead!: (u: User | null) => void;
    dbAuthMock.getUserById.mockReturnValue(
      new Promise<User | null>((resolve) => {
        resolveRead = resolve;
      }),
    );

    const p1 = layoutCaches.getFreshLayoutUser(sessionUser, "t1");
    const p2 = layoutCaches.getFreshLayoutUser(sessionUser, "t1");
    // The DB read starts after the lazy db-module import resolves.
    await vi.waitFor(() => expect(dbAuthMock.getUserById).toHaveBeenCalledTimes(1));

    const fresh = { _id: "u1", email: "a@b.c", role: "admin" } as unknown as User;
    resolveRead(fresh);

    await expect(p1).resolves.toBe(fresh);
    await expect(p2).resolves.toBe(fresh);
    expect(cacheService.set).toHaveBeenCalledTimes(1);
  });

  it("does not share the in-flight read across tenants", async () => {
    dbAuthMock.getUserById.mockResolvedValue({ _id: "u1" } as unknown as User);

    await Promise.all([
      layoutCaches.getFreshLayoutUser(sessionUser, "t1"),
      layoutCaches.getFreshLayoutUser(sessionUser, "t2"),
    ]);

    expect(dbAuthMock.getUserById).toHaveBeenCalledTimes(2);
  });

  it("falls back to the session snapshot when the DB read fails", async () => {
    dbAuthMock.getUserById.mockRejectedValue(new Error("db down"));

    await expect(layoutCaches.getFreshLayoutUser(sessionUser, "t1")).resolves.toBe(sessionUser);
    expect(cacheService.set).toHaveBeenCalledWith("layout:user:u1", sessionUser, 15, "t1");
  });

  it("invalidate clears the L1 entry and the in-flight entry", async () => {
    const resolvers: Array<(u: User | null) => void> = [];
    dbAuthMock.getUserById.mockImplementation(
      () => new Promise<User | null>((resolve) => resolvers.push(resolve)),
    );

    const p1 = layoutCaches.getFreshLayoutUser(sessionUser, "t1");
    const p2 = layoutCaches.getFreshLayoutUser(sessionUser, "t1"); // shares flight 1
    await vi.waitFor(() => expect(dbAuthMock.getUserById).toHaveBeenCalledTimes(1));

    await layoutCaches.invalidateLayoutUserCache("u1", "t1");
    expect(cacheService.delete).toHaveBeenCalledWith("layout:user:u1", "t1");

    const p3 = layoutCaches.getFreshLayoutUser(sessionUser, "t1"); // flight 1 cleared → flight 2
    await vi.waitFor(() => expect(dbAuthMock.getUserById).toHaveBeenCalledTimes(2));

    // Flight 1 settles AFTER the invalidation — its cleanup must not clobber flight 2.
    const old = { _id: "u1", email: "old@x.c" } as unknown as User;
    resolvers[0](old);

    const p4 = layoutCaches.getFreshLayoutUser(sessionUser, "t1"); // still shares flight 2
    await vi.waitFor(() => expect(dbAuthMock.getUserById).toHaveBeenCalledTimes(2));

    const fresh = { _id: "u1", email: "new@x.c" } as unknown as User;
    resolvers[1](fresh);

    await expect(p1).resolves.toBe(old);
    await expect(p2).resolves.toBe(old);
    await expect(p3).resolves.toBe(fresh);
    await expect(p4).resolves.toBe(fresh);
  });
});

describe("getLayoutPluginStates", () => {
  it("returns an empty map when no plugins are registered, without a settings read", async () => {
    registryMock.getAll.mockReturnValue([]);

    await expect(layoutCaches.getLayoutPluginStates("t1")).resolves.toEqual({});
    expect(registryMock.getAllPluginStates).not.toHaveBeenCalled();
  });

  it("single-flights concurrent misses for the same tenant into one settings read", async () => {
    registryMock.getAll.mockReturnValue([{ metadata: { id: "p1", enabled: true } }]);

    let resolveStates!: (v: Array<{ pluginId: string; enabled: boolean }>) => void;
    registryMock.getAllPluginStates.mockReturnValue(
      new Promise((resolve) => {
        resolveStates = resolve;
      }),
    );

    const q1 = layoutCaches.getLayoutPluginStates("t1");
    const q2 = layoutCaches.getLayoutPluginStates("t1");
    expect(registryMock.getAllPluginStates).toHaveBeenCalledTimes(1);

    resolveStates([{ pluginId: "p1", enabled: false }]);

    await expect(q1).resolves.toEqual({ p1: false });
    await expect(q2).resolves.toEqual({ p1: false });
  });

  it("falls back to plugin metadata defaults when the settings read fails", async () => {
    registryMock.getAll.mockReturnValue([{ metadata: { id: "p1", enabled: true } }]);
    registryMock.getAllPluginStates.mockRejectedValue(new Error("settings down"));

    await expect(layoutCaches.getLayoutPluginStates("t1")).resolves.toEqual({ p1: true });
  });

  it("the globalThis invalidator bridge clears the in-flight entry too", async () => {
    registryMock.getAll.mockReturnValue([{ metadata: { id: "p1", enabled: true } }]);

    const resolvers: Array<(v: Array<{ pluginId: string; enabled: boolean }>) => void> = [];
    registryMock.getAllPluginStates.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );

    const q1 = layoutCaches.getLayoutPluginStates("t1");
    const q2 = layoutCaches.getLayoutPluginStates("t1"); // shares flight 1
    expect(registryMock.getAllPluginStates).toHaveBeenCalledTimes(1);

    (globalThis as any).__sveltycms_layout_invalidators.pluginStates("t1");
    expect(cacheService.delete).toHaveBeenCalledWith("layout:pluginStates:t1", "t1");

    const q3 = layoutCaches.getLayoutPluginStates("t1"); // flight 1 cleared → flight 2
    expect(registryMock.getAllPluginStates).toHaveBeenCalledTimes(2);

    // Flight 1 settles AFTER the invalidation — its cleanup must not clobber flight 2.
    resolvers[0]([{ pluginId: "p1", enabled: false }]);

    const q4 = layoutCaches.getLayoutPluginStates("t1"); // still shares flight 2
    expect(registryMock.getAllPluginStates).toHaveBeenCalledTimes(2);

    resolvers[1]([{ pluginId: "p1", enabled: true }]);

    await expect(q1).resolves.toEqual({ p1: false });
    await expect(q2).resolves.toEqual({ p1: false });
    await expect(q3).resolves.toEqual({ p1: true });
    await expect(q4).resolves.toEqual({ p1: true });
  });
});
