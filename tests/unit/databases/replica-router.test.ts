/**
 * @file tests/unit/databases/replica-router.test.ts
 * @description Unit tests for Read-Replica Splitting & Read-Your-Writes (RYW) consistency engine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createReplicaRouterAdapter,
  ReadYourWritesTracker,
  ReplicaNode,
  ReplicaPool,
  ReplicaRouterAdapter,
} from "@src/databases/core/replica-router";
import type { IDBAdapter } from "@src/databases/db-interface";

describe("Read-Replica Router & Consistency Engine", () => {
  let mockPrimary: any;
  let mockReplica1: any;
  let mockReplica2: any;

  beforeEach(() => {
    mockPrimary = {
      type: "postgresql",
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      disconnect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      getVersion: vi.fn().mockResolvedValue({ success: true, data: "16.2" }),
      getCapabilities: vi.fn().mockReturnValue({}),
      crud: {
        insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
        update: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
        delete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
        findById: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "primary" } }),
        findOne: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "primary" } }),
        findMany: vi
          .fn()
          .mockResolvedValue({ success: true, data: [{ _id: "1", source: "primary" }] }),
        count: vi.fn().mockResolvedValue({ success: true, data: 1 }),
      },
      batch: {
        bulkInsert: vi.fn().mockResolvedValue({ success: true, data: [] }),
        bulkUpdate: vi.fn().mockResolvedValue({ success: true, data: [] }),
        bulkDelete: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
      auth: {
        getUserById: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
        createUser: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
      },
      content: {
        getNodeBySlug: vi.fn().mockResolvedValue({ success: true, data: { _id: "n1" } }),
        createNode: vi.fn().mockResolvedValue({ success: true, data: { _id: "n1" } }),
      },
      media: {},
      collection: {},
      system: {},
      monitoring: {},
      transaction: vi.fn().mockImplementation(async (cb: any) => cb({})),
    };

    mockReplica1 = {
      type: "postgresql",
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      disconnect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      crud: {
        findById: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "replica1" } }),
        findOne: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "replica1" } }),
        findMany: vi
          .fn()
          .mockResolvedValue({ success: true, data: [{ _id: "1", source: "replica1" }] }),
        count: vi.fn().mockResolvedValue({ success: true, data: 1 }),
      },
      auth: {
        getUserById: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "u1", source: "replica1" } }),
      },
      content: {
        getNodeBySlug: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "n1", source: "replica1" } }),
      },
    };

    mockReplica2 = {
      type: "postgresql",
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      disconnect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      crud: {
        findById: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "replica2" } }),
        findOne: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "1", source: "replica2" } }),
        findMany: vi
          .fn()
          .mockResolvedValue({ success: true, data: [{ _id: "1", source: "replica2" }] }),
        count: vi.fn().mockResolvedValue({ success: true, data: 1 }),
      },
      auth: {
        getUserById: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "u1", source: "replica2" } }),
      },
      content: {
        getNodeBySlug: vi
          .fn()
          .mockResolvedValue({ success: true, data: { _id: "n1", source: "replica2" } }),
      },
    };
  });

  describe("Factory & Zero-Overhead Mode", () => {
    it("returns primary adapter unchanged when replicas array is empty or undefined", () => {
      const adapter1 = createReplicaRouterAdapter(mockPrimary as unknown as IDBAdapter);
      expect(adapter1).toBe(mockPrimary);

      const adapter2 = createReplicaRouterAdapter(mockPrimary as unknown as IDBAdapter, []);
      expect(adapter2).toBe(mockPrimary);
    });

    it("creates a ReplicaRouterAdapter when replicas are supplied", () => {
      const routed = createReplicaRouterAdapter(mockPrimary as unknown as IDBAdapter, [
        mockReplica1 as unknown as IDBAdapter,
      ]);
      expect(routed).toBeInstanceOf(ReplicaRouterAdapter);
    });
  });

  describe("ReadYourWritesTracker", () => {
    it("tracks writes per client and honors expiration window", async () => {
      const tracker = new ReadYourWritesTracker();
      expect(tracker.hasRecentWrite("t1", "user-1", 1000)).toBe(false);

      tracker.recordWrite("t1", "user-1");
      expect(tracker.hasRecentWrite("t1", "user-1", 1000)).toBe(true);
      expect(tracker.hasRecentWrite("t1", "other-user", 1000)).toBe(false);

      // Window expiration
      expect(tracker.hasRecentWrite("t1", "user-1", -1)).toBe(false);
    });

    it("ignores writes without client identifier", () => {
      const tracker = new ReadYourWritesTracker();
      tracker.recordWrite("t1", undefined);
      expect(tracker.hasRecentWrite("t1", undefined, 1000)).toBe(false);
    });
  });

  describe("Load Balancing & Routing", () => {
    it("routes mutations strictly to primary and reads to replicas round-robin", async () => {
      const routed = createReplicaRouterAdapter(
        mockPrimary as unknown as IDBAdapter,
        [mockReplica1 as unknown as IDBAdapter, mockReplica2 as unknown as IDBAdapter],
        { loadBalancing: "round-robin" },
      );

      // 1. Write -> Primary
      await routed.crud.insert("posts", { title: "New" } as any, { tenantId: "t1" as any });
      expect(mockPrimary.crud.insert).toHaveBeenCalledTimes(1);

      // 2. Read 1 -> Replica 1
      const res1 = await routed.crud.findOne(
        "posts",
        { _id: "1" as any },
        { tenantId: "t1" as any },
      );
      expect((res1 as any).data).toMatchObject({ source: "replica1" });
      expect(mockReplica1.crud.findOne).toHaveBeenCalledTimes(1);

      // 3. Read 2 -> Replica 2
      const res2 = await routed.crud.findOne(
        "posts",
        { _id: "1" as any },
        { tenantId: "t1" as any },
      );
      expect((res2 as any).data).toMatchObject({ source: "replica2" });
      expect(mockReplica2.crud.findOne).toHaveBeenCalledTimes(1);

      // 4. Read 3 -> Replica 1 (wrap around)
      const res3 = await routed.crud.findOne(
        "posts",
        { _id: "1" as any },
        { tenantId: "t1" as any },
      );
      expect((res3 as any).data).toMatchObject({ source: "replica1" });
    });

    it("honors least-connections load balancing", async () => {
      const node1 = new ReplicaNode("r1", mockReplica1 as unknown as IDBAdapter, {});
      const node2 = new ReplicaNode("r2", mockReplica2 as unknown as IDBAdapter, {});
      node1.activeQueries = 5;
      node2.activeQueries = 1;

      const pool = new ReplicaPool([node1, node2], "least-connections");
      const selected = pool.selectReplica();
      expect(selected?.id).toBe("r2");
    });
  });

  describe("Read-Your-Writes (RYW) Consistency", () => {
    it("routes subsequent reads from same client to primary after a mutation", async () => {
      const routed = createReplicaRouterAdapter(
        mockPrimary as unknown as IDBAdapter,
        [mockReplica1 as unknown as IDBAdapter],
        { readYourWritesWindowMs: 2000 },
      );

      const clientId = "client-editor-99";

      // Write with client ID
      await routed.crud.update(
        "posts",
        "1" as any,
        { title: "Updated" } as any,
        {
          tenantId: "t1" as any,
          clientId,
        } as any,
      );

      // Immediate read from same client -> must hit primary!
      const readRes = await routed.crud.findOne("posts", { _id: "1" as any }, {
        tenantId: "t1" as any,
        clientId,
      } as any);

      expect((readRes as any).data).toMatchObject({ source: "primary" });
      expect(mockPrimary.crud.findOne).toHaveBeenCalledTimes(1);
      expect(mockReplica1.crud.findOne).not.toHaveBeenCalled();

      // Read from a different client -> hits replica!
      const otherRead = await routed.crud.findOne("posts", { _id: "1" as any }, {
        tenantId: "t1" as any,
        clientId: "client-other",
      } as any);
      expect((otherRead as any).data).toMatchObject({ source: "replica1" });
      expect(mockReplica1.crud.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe("Transaction Affinity & Fallback", () => {
    it("pins all operations inside transaction to primary", async () => {
      const routed = createReplicaRouterAdapter(mockPrimary as unknown as IDBAdapter, [
        mockReplica1 as unknown as IDBAdapter,
      ]);

      await routed.transaction(async () => {
        // Query inside transaction
        await routed.crud.findOne("posts", { _id: "1" as any }, { tenantId: "t1" as any });
        return { success: true, data: undefined };
      });

      expect(mockPrimary.crud.findOne).toHaveBeenCalledTimes(1);
      expect(mockReplica1.crud.findOne).not.toHaveBeenCalled();
    });

    it("falls back to primary when replica encounters an unexpected failure", async () => {
      mockReplica1.crud.findOne.mockRejectedValueOnce(new Error("Replica DB timeout"));

      const routed = createReplicaRouterAdapter(mockPrimary as unknown as IDBAdapter, [
        mockReplica1 as unknown as IDBAdapter,
      ]);

      const res = await routed.crud.findOne(
        "posts",
        { _id: "1" as any },
        { tenantId: "t1" as any },
      );
      expect(res.success).toBe(true);
      expect((res as any).data).toMatchObject({ source: "primary" });

      const stats = (routed as ReplicaRouterAdapter).getReplicaStats();
      expect(stats.failoverHits).toBe(1);
    });
  });
});
