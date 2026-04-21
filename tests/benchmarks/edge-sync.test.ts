import { test, expect } from "bun:test";
import { CacheService } from "../../src/databases/cache/cache-service";

test("Edge Sync - Distributed Invalidation Verification", async () => {
  // Shared mock L2 (Redis)
  const mockL2Store = new Map<string, string>();
  const subscribers = new Set<(channel: string, message: string) => void>();

  const mockL2 = {
    isOpen: true,
    get: async (key: string) => mockL2Store.get(key) || null,
    set: async (key: string, val: string) => mockL2Store.set(key, JSON.stringify(val)),
    del: async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((k) => mockL2Store.delete(k));
    },
    scan: async (_cursor: string, options: { MATCH: string }) => {
      const pattern = options.MATCH.replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}$`);
      const keys = Array.from(mockL2Store.keys()).filter((k) => regex.test(k));
      return { cursor: "0", keys };
    },
    publish: async (channel: string, message: string) => {
      subscribers.forEach((s) => s(channel, message));
    },
  };

  const mockSubscriber = {
    isOpen: true,
    subscribe: async (channel: string, callback: (msg: string) => void) => {
      subscribers.add((ch, msg) => {
        if (ch === channel) callback(msg);
      });
    },
  };

  // Initialize two distinct nodes with unique IDs
  const nodeA = new CacheService();
  (nodeA as any).l2 = mockL2;
  (nodeA as any).subscriber = mockSubscriber;
  (nodeA as any).nodeId = "node_A";

  const nodeB = new CacheService();
  (nodeB as any).l2 = mockL2;
  (nodeB as any).subscriber = mockSubscriber;
  (nodeB as any).nodeId = "node_B";

  // Start Node B listener
  await (nodeB as any).subscribeToInvalidations();

  // 1. Warm Node B's L1 Cache
  const testKey = "collection:posts:123";
  const testValue = { title: "Hello" };
  await nodeB.set(testKey, testValue, 60);
  expect(await nodeB.get(testKey)).not.toBeNull();

  // 2. Node A triggers invalidation (simulating an update in another region/node)
  await nodeA.clearByPattern("collection:posts:*");

  // 3. Node B should have purged its L1
  // We wait a micro-task for the async pub/sub to propagate
  await new Promise((r) => setTimeout(r, 50));

  const result = await nodeB.get(testKey);

  console.log(
    `\n📊 Edge Sync Verification: Node B L1 State: ${result === null ? "PURGED (Success)" : "STALE (Failure)"}`,
  );

  expect(result).toBeNull();
});
