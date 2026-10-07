/**
 * @file tests/unit/databases/batch-module.test.ts
 * @description Unit tests for relational BatchModule operations, coalescing, and security gates.
 *
 * Features:
 * - Multi-tenant isolation: rejects batches containing mixed tenant IDs
 * - Write-queue coalescing: batches same-collection inserts into insertMany
 * - Write-queue coalescing: batches same-collection deletes into deleteMany
 * - Write-queue coalescing: batches same-collection upserts into upsertMany
 * - Graceful single-op execution fallback for non-coalesced or single-item operations
 * - Error propagation and status reporting for failed batch operations
 */

import { describe, expect, it, vi } from "vitest";
import { BatchModule } from "@src/databases/core/batch-module";
import type {
  BatchOperation,
  DatabaseId,
  DatabaseResult,
  ISqlAdapter,
} from "@src/databases/db-interface";

function createMockSqlAdapter(): {
  adapter: ISqlAdapter;
  insertMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  upsertMany: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const insertMany = vi.fn().mockImplementation(async (_col, items) => ({
    success: true,
    data: items.map((it: Record<string, unknown>, idx: number) => ({
      _id: `id_${idx}`,
      ...it,
    })),
  }));

  const deleteMany = vi.fn().mockImplementation(async () => ({
    success: true,
    data: 2,
  }));

  const upsertMany = vi.fn().mockImplementation(async (_col, items) => ({
    success: true,
    data: items.map((it: { data: Record<string, unknown> }, idx: number) => ({
      _id: `upsert_${idx}`,
      ...it.data,
    })),
  }));

  const insert = vi.fn().mockImplementation(async (_col, item) => ({
    success: true,
    data: { _id: "single_1", ...item },
  }));

  const update = vi.fn().mockImplementation(async (_col, id, patch) => ({
    success: true,
    data: { _id: id, ...patch },
  }));

  const deleteFn = vi.fn().mockImplementation(async (_col, id) => ({
    success: true,
    data: { _id: id },
  }));

  const crud = {
    insertMany,
    deleteMany,
    upsertMany,
    insert,
    update,
    delete: deleteFn,
  };

  const adapter = {
    crud,
    wrap: async <R>(fn: () => Promise<R>): Promise<DatabaseResult<R>> => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (err: unknown) {
        return {
          success: false,
          message: err instanceof Error ? err.message : String(err),
          error: {
            code: "WRAP_ERROR",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  } as unknown as ISqlAdapter;

  return {
    adapter,
    insertMany,
    deleteMany,
    upsertMany,
    insert,
    update,
    delete: deleteFn,
  };
}

describe("BatchModule unit tests", () => {
  describe("security: multi-tenant isolation", () => {
    it("rejects batches containing mixed tenantIds to prevent cross-tenant leaks", async () => {
      const { adapter } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "insert",
          collection: "posts",
          data: { title: "Tenant A Post" },
          tenantId: "tenant_a" as DatabaseId,
        },
        {
          operation: "insert",
          collection: "posts",
          data: { title: "Tenant B Post" },
          tenantId: "tenant_b" as DatabaseId,
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.message).toContain("[SECURITY] Batch contains mixed tenantIds");
        expect(res.message).toContain("tenant_a vs tenant_b");
      }
    });

    it("accepts batches where all operations belong to the same tenantId", async () => {
      const { adapter, insertMany } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "insert",
          collection: "articles",
          data: { title: "Article 1" },
          tenantId: "tenant_alpha" as DatabaseId,
        },
        {
          operation: "insert",
          collection: "articles",
          data: { title: "Article 2" },
          tenantId: "tenant_alpha" as DatabaseId,
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true);
      expect(insertMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("write-queue coalescing", () => {
    it("coalesces multiple insert operations on the same collection into insertMany", async () => {
      const { adapter, insertMany } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "insert",
          collection: "products",
          data: { sku: "A1", price: 10 },
        },
        {
          operation: "insert",
          collection: "products",
          data: { sku: "A2", price: 20 },
        },
        {
          operation: "insert",
          collection: "products",
          data: { sku: "A3", price: 30 },
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(insertMany).toHaveBeenCalledTimes(1);
      expect(insertMany).toHaveBeenCalledWith("products", [
        { sku: "A1", price: 10 },
        { sku: "A2", price: 20 },
        { sku: "A3", price: 30 },
      ]);
      expect(res.data.totalProcessed).toBe(3);
    });

    it("coalesces multiple delete operations on the same collection into deleteMany with IN filter", async () => {
      const { adapter, deleteMany } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "delete",
          collection: "comments",
          id: "cmt_1" as DatabaseId,
        },
        {
          operation: "delete",
          collection: "comments",
          id: "cmt_2" as DatabaseId,
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(deleteMany).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith("comments", {
        _id: { $in: ["cmt_1", "cmt_2"] },
      });
      expect(res.data.totalProcessed).toBe(2);
    });

    it("coalesces multiple upsert operations on the same collection into upsertMany", async () => {
      const { adapter, upsertMany } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "upsert",
          collection: "settings",
          query: { key: "site_name" },
          data: { value: "My CMS" },
        },
        {
          operation: "upsert",
          collection: "settings",
          query: { key: "site_desc" },
          data: { value: "Headless CMS" },
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(upsertMany).toHaveBeenCalledTimes(1);
      expect(res.data.totalProcessed).toBe(2);
    });

    it("falls back to single-op execution for update operations or distinct collections", async () => {
      const { adapter, update } = createMockSqlAdapter();
      const batchModule = new BatchModule(adapter);

      const operations: BatchOperation<Record<string, unknown>>[] = [
        {
          operation: "update",
          collection: "users",
          id: "usr_1" as DatabaseId,
          data: { name: "Alice" },
        },
        {
          operation: "update",
          collection: "users",
          id: "usr_2" as DatabaseId,
          data: { name: "Bob" },
        },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true);
      if (!res.success) throw new Error("Expected success");
      expect(update).toHaveBeenCalledTimes(2);
      expect(res.data.totalProcessed).toBe(2);
    });
  });

  describe("error handling", () => {
    it("captures errors when bulk insert fails and reports in batch result", async () => {
      const { adapter, insertMany } = createMockSqlAdapter();
      insertMany.mockResolvedValueOnce({
        success: false,
        message: "Unique constraint violated",
        error: { code: "ER_DUP_ENTRY", message: "Duplicate SKU" },
      });

      const batchModule = new BatchModule(adapter);
      const operations: BatchOperation<Record<string, unknown>>[] = [
        { operation: "insert", collection: "items", data: { sku: "DUP" } },
        { operation: "insert", collection: "items", data: { sku: "DUP" } },
      ];

      const res = await batchModule.execute(operations);
      expect(res.success).toBe(true); // execute returns container result
      if (!res.success) throw new Error("Expected success");
      expect(res.data.errors).toHaveLength(1);
      expect(res.data.errors[0].code).toBe("ER_DUP_ENTRY");
    });
  });
});
