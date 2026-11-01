/**
 * @file tests/unit/databases/cache-service-epoch-propagation.test.ts
 * @description Cross-node collection-epoch propagation (M2 residual).
 *
 * `bumpCollectionEpoch` persists the new value to L2, but a peer's
 * `getCollectionEpoch` only reads its process-local map plus `getSync` (L1) —
 * it never reloads the L2 key, so a peer kept serving list/GraphQL bodies
 * stamped with its stale epoch until TTL. The bump now publishes the epoch on
 * the existing invalidation channel and subscribers apply it locally.
 *
 * Runs entirely on the deterministic in-memory FakeRedis: the `redis` package
 * is not required, and no network connection is opened. The pub/sub client used
 * by `subscribeToInvalidations` is the same one exercised here, so the only
 * limitation is that a live Redis is not part of this suite (the L2 contract
 * suite optionally covers real pub/sub when `TEST_REDIS_URL` is reachable).
 *
 * ### Features tested
 * - a peer sees a bumped epoch without reading L2
 * - tenant-scoped epochs stay isolated
 * - the synthetic GraphQL scope propagates like any collection
 * - a node ignores its own published messages, and values never regress
 * - a list body stamped with the pre-bump epoch is rejected on the peer
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheService, cacheService as singletonCache } from "@src/databases/cache/cache-service";
import {
  buildUserResponseCacheKey,
  responseCache,
  type CachedResponseEntry,
} from "@src/services/cache/response-cache";
import { FakeRedis } from "./fake-redis";

const CHANNEL = "svelty:cache:invalidation";

let fake: FakeRedis;
let serviceA: CacheService;
let serviceB: CacheService;

function unique(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Bounded poll — pub/sub delivery is asynchronous by contract. */
async function waitFor(read: () => number, expected: number, timeoutMs = 2_000): Promise<number> {
  const startedAt = Date.now();
  let value = read();
  while (value !== expected && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    value = read();
  }
  return value;
}

beforeEach(async () => {
  fake = new FakeRedis();
  serviceA = new CacheService();
  serviceB = new CacheService();
  await serviceA.connectL2ForTest(fake, fake);
  await serviceB.connectL2ForTest(fake, fake);
});

afterEach(async () => {
  // Best-effort: FakeRedis has no unsubscribe; cleanup destroys the shared fake.
  await serviceA?.cleanup().catch(() => {});
  await serviceB?.cleanup().catch(() => {});
});

describe("CacheService collection-epoch propagation", () => {
  it("updates a peer's getCollectionEpoch without an L2 read", async () => {
    const tenant = unique("tenant");
    const collection = unique("posts");

    expect(serviceB.getCollectionEpoch(collection, tenant)).toBe(0);

    serviceA.bumpCollectionEpoch(collection, tenant);

    expect(await waitFor(() => serviceB.getCollectionEpoch(collection, tenant), 1)).toBe(1);
    // A second write keeps moving the peer's fence.
    serviceA.bumpCollectionEpoch(collection, tenant);
    expect(await waitFor(() => serviceB.getCollectionEpoch(collection, tenant), 2)).toBe(2);
  });

  it("keeps tenants isolated and propagates the synthetic GraphQL scope", async () => {
    const tenantA = unique("tenant-a");
    const tenantB = unique("tenant-b");
    const collection = unique("pages");

    serviceA.bumpCollectionEpoch(collection, tenantA);
    serviceA.bumpCollectionEpoch("__graphql__", tenantA);

    expect(await waitFor(() => serviceB.getCollectionEpoch(collection, tenantA), 1)).toBe(1);
    expect(await waitFor(() => serviceB.getCollectionEpoch("__graphql__", tenantA), 1)).toBe(1);
    expect(serviceB.getCollectionEpoch(collection, tenantB)).toBe(0);
  });

  it("ignores its own published messages and never regresses on an older value", async () => {
    const tenant = unique("tenant-own");
    const collection = unique("articles");

    serviceA.bumpCollectionEpoch(collection, tenant);
    expect(await waitFor(() => serviceB.getCollectionEpoch(collection, tenant), 1)).toBe(1);

    // Craft a message attributed to A: A must ignore it, B must apply it.
    await fake.publish(
      CHANNEL,
      JSON.stringify({
        nodeId: (serviceA as unknown as { nodeId: string }).nodeId,
        tenantId: tenant,
        collectionEpoch: { collection, tenantId: tenant, value: 9 },
      }),
    );

    expect(serviceA.getCollectionEpoch(collection, tenant)).toBe(1);
    expect(serviceB.getCollectionEpoch(collection, tenant)).toBe(9);

    // Out-of-order delivery must not roll the peer back.
    await fake.publish(
      CHANNEL,
      JSON.stringify({
        nodeId: "another-node",
        tenantId: tenant,
        collectionEpoch: { collection, tenantId: tenant, value: 2 },
      }),
    );

    expect(serviceB.getCollectionEpoch(collection, tenant)).toBe(9);
  });

  it("rejects a list body stamped with the peer's pre-bump epoch", async () => {
    const tenant = unique("tenant-list");
    const collection = unique("list");
    const key = buildUserResponseCacheKey(`/api/collections/${collection}`, "?limit=10", "u1");

    // The exported singleton plays the second node: it subscribes to the same
    // FakeRedis, so it receives A's epoch message exactly like a real peer.
    await singletonCache.connectL2ForTest(fake, fake);
    responseCache.trimLocal();

    // A body produced before the write, still resident on this node.
    const stale: CachedResponseEntry = {
      body: '{"items":["stale"]}',
      etag: '"stale"',
      gen: 0,
      expiresAt: Date.now() + 60_000,
    };
    await singletonCache.set(`res:${key}`, stale, 60, tenant);
    expect(responseCache.get(key, tenant)?.body).toBe('{"items":["stale"]}');
    // Drop the response-cache L1 slot (capacity-gated admission / FIFO eviction)
    // while the shared `res:<key>` copy survives — the state the epoch fence
    // exists for. A local L1 hit is intentionally not epoch-checked.
    responseCache.trimLocal();

    // Peer write: A bumps, the singleton must observe the new epoch…
    serviceA.bumpCollectionEpoch(collection, tenant);
    expect(await waitFor(() => singletonCache.getCollectionEpoch(collection, tenant), 1)).toBe(1);

    // …and the refill of the now-superseded body must be rejected.
    expect(responseCache.get(key, tenant)).toBeNull();

    await singletonCache.cleanup().catch(() => {});
  });
});
