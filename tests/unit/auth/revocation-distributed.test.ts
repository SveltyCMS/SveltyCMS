/**
 * @file tests/unit/auth/revocation-distributed.test.ts
 * @description Distributed (cross-node) revocation markers: a revocation published
 * by one worker must be observed by another worker whose in-process epoch is empty.
 *
 * Features:
 * - Tenant-scope and global-scope markers published on "node A", read on "node B"
 * - User-scope publication stays byte-compatible with its existing reader
 * - Marker TTL is pinned to the documented 30-day (longest session) bound
 * - Memoized reads: one cache round-trip per scope per window, never per request
 * - Fail-open marker write/read (the in-process epoch stays authoritative)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Shared cache stand-in: both "nodes" resolve the same `cacheService` store, the
 * way workers share one Redis. Reset per test.
 */
const store = vi.hoisted(() => new Map<string, { value: unknown; ttl: number }>());

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(
      async (key: string, tenantId?: string | null) =>
        store.get(`${tenantId ?? "default"}:${key}`)?.value ?? null,
    ),
    set: vi.fn(async (key: string, value: unknown, ttl: number, tenantId?: string | null) => {
      store.set(`${tenantId ?? "default"}:${key}`, { value, ttl });
    }),
  },
}));

type PublishModule = typeof import("@src/databases/auth/revocation-publish.server");
type EpochModule = typeof import("@src/databases/auth/revocation-epoch");
type CacheModule = typeof import("@src/databases/cache/cache-service");

interface NodeRuntime {
  publish: PublishModule;
  epoch: EpochModule;
  cache: CacheModule;
}

/**
 * Loads a fresh module graph = a separate process: module-local epochs, pruning
 * maps and read memos all start empty, while the mocked cache is shared.
 */
async function loadNode(): Promise<NodeRuntime> {
  vi.resetModules();
  return {
    publish: await import("@src/databases/auth/revocation-publish.server"),
    epoch: await import("@src/databases/auth/revocation-epoch"),
    cache: await import("@src/databases/cache/cache-service"),
  };
}

describe("Distributed revocation markers", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("propagates a tenant revocation from node A to node B", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishTenantRevocation("tenant-alpha");
    expect(epoch).toBeGreaterThan(0);
    expect(store.get(`tenant-alpha:auth:revoke:tenant:tenant-alpha`)?.value).toBe(epoch);

    const issuedBefore = epoch - 60_000;
    const issuedAfter = epoch + 60_000;

    // Node A rejects from its own in-process epoch.
    expect(nodeA.epoch.isSessionRevoked(issuedBefore, "user-1", "tenant-alpha")).toBe(true);

    // Node B never saw the revoke: its maps are empty, so the local check passes.
    const nodeB = await loadNode();
    expect(nodeB.epoch.getRevocationStats().revokedTenantsCount).toBe(0);
    expect(nodeB.epoch.isSessionRevoked(issuedBefore, "user-1", "tenant-alpha")).toBe(false);

    // The distributed marker closes the gap for node B.
    const remoteEpoch = await nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-alpha");
    expect(remoteEpoch).toBe(epoch);
    expect(issuedBefore < remoteEpoch).toBe(true);
    expect(issuedAfter < remoteEpoch).toBe(false);

    // Scoping: unrelated tenants are untouched by the marker.
    expect(await nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-beta")).toBe(0);
  });

  it("propagates a global revocation from node A to node B", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishGlobalRevocation();
    expect(epoch).toBeGreaterThan(0);
    // Global marker sits in the default namespace: readable from any tenant scope.
    expect(store.get("default:auth:revoke:global")?.value).toBe(epoch);

    const nodeB = await loadNode();
    expect(nodeB.epoch.getRevocationStats().globalEpoch).toBe(0);
    expect(await nodeB.publish.getDistributedRevocationEpoch("global")).toBe(epoch);

    const issuedBefore = epoch - 60_000;
    expect(issuedBefore < (await nodeB.publish.getDistributedRevocationEpoch("global"))).toBe(true);

    // A global marker must not be mistaken for a tenant-scope marker.
    expect(await nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-alpha")).toBe(0);
  });

  it("leaves user-scope revocation unchanged", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishUserRevocation("user-1", "tenant-alpha");
    expect(epoch).toBeGreaterThan(0);
    // Same key/namespace the pre-existing reader (`handle-authentication.ts`) expects.
    expect(store.get("tenant-alpha:auth:revoke:user:user-1")?.value).toBe(epoch);
    // User publication must not write tenant/global markers.
    expect(store.has("default:auth:revoke:global")).toBe(false);
    expect(store.has("tenant-alpha:auth:revoke:tenant:tenant-alpha")).toBe(false);

    const nodeB = await loadNode();
    expect(nodeB.epoch.isSessionRevoked(epoch - 1_000, "user-1", "tenant-alpha")).toBe(false);
    expect(
      await nodeB.publish.getDistributedRevocationEpoch("user", "user-1", "tenant-alpha"),
    ).toBe(epoch);
  });

  it("bounds every marker TTL to the longest session lifetime", async () => {
    const node = await loadNode();
    await node.publish.publishGlobalRevocation();
    await node.publish.publishTenantRevocation("tenant-alpha");
    await node.publish.publishUserRevocation("user-1", "tenant-alpha");

    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    expect(node.publish.REVOCATION_MARKER_TTL_SECONDS).toBe(thirtyDaysInSeconds);
    expect(store.size).toBe(3);
    for (const entry of store.values()) {
      expect(entry.ttl).toBe(thirtyDaysInSeconds);
    }
  });

  it("reads a marker at most once per memo window", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishTenantRevocation("tenant-alpha");

    const nodeB = await loadNode();
    const getSpy = vi.mocked(nodeB.cache.cacheService.get);
    getSpy.mockClear();

    expect(await nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-alpha")).toBe(epoch);
    expect(await nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-alpha")).toBe(epoch);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("fails open when the marker write or read is unavailable", async () => {
    const nodeA = await loadNode();
    vi.mocked(nodeA.cache.cacheService.set).mockRejectedValueOnce(new Error("cache down"));

    // The publish still succeeds: the in-process epoch and the session purge
    // remain authoritative on this worker.
    await expect(nodeA.publish.publishTenantRevocation("tenant-alpha")).resolves.toBeGreaterThan(0);
    expect(nodeA.epoch.isSessionRevoked(Date.now() - 1_000, "user-1", "tenant-alpha")).toBe(true);

    // A node that cannot read the marker treats it as absent (0), never throws.
    const nodeB = await loadNode();
    vi.mocked(nodeB.cache.cacheService.get).mockRejectedValueOnce(new Error("cache down"));
    await expect(
      nodeB.publish.getDistributedRevocationEpoch("tenant", "tenant-alpha"),
    ).resolves.toBe(0);
  });
});
