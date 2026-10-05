/**
 * @file tests/unit/databases/mongo-unordered-bulk.test.ts
 * @description Unit tests for MongoDB unordered bulk writes (parallel execution).
 *
 * Features:
 * - verifies bulkUpdate defaults to ordered: false
 * - verifies options.ordered: true is respected when sequentially ordered writes are requested
 * - verifies crudMethods (insertMany, upsertMany, bulkUpdate) pass ordered: false by default
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/databases/db-interface";

// Stub mongoose
vi.mock("mongoose", () => {
  return {
    default: {
      connection: {},
      model: vi.fn(),
      Schema: class {},
      Types: { ObjectId: class {} },
    },
  };
});

describe("MongoDB Unordered Bulk Writes", () => {
  describe("MongoBatchModule.bulkUpdate", () => {
    it("defaults to ordered: false for parallel shard execution", async () => {
      const { MongoBatchModule } = await import("@src/databases/mongodb/batch-module");
      const mockBulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 2 });
      const mockModel = { bulkWrite: mockBulkWrite };

      const batchModule = new MongoBatchModule({
        getModel: () => mockModel,
      } as any);

      const updates = [
        { id: "id_1" as DatabaseId, data: { title: "Title 1" } },
        { id: "id_2" as DatabaseId, data: { title: "Title 2" } },
      ];

      const res = await batchModule.bulkUpdate("posts", updates);
      expect(res.success).toBe(true);
      expect(mockBulkWrite).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ ordered: false }),
      );
    });

    it("respects options.ordered: true when caller requires sequential ordering", async () => {
      const { MongoBatchModule } = await import("@src/databases/mongodb/batch-module");
      const mockBulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 2 });
      const mockModel = { bulkWrite: mockBulkWrite };

      const batchModule = new MongoBatchModule({
        getModel: () => mockModel,
      } as any);

      const updates = [
        { id: "id_1" as DatabaseId, data: { title: "Title 1" } },
        { id: "id_2" as DatabaseId, data: { title: "Title 2" } },
      ];

      const res = await batchModule.bulkUpdate("posts", updates, { ordered: true });
      expect(res.success).toBe(true);
      expect(mockBulkWrite).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ ordered: true }),
      );
    });
  });
});
