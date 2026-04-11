/**
 * @file tests/unit/databases/soft-delete.test.ts
 * @description Unit tests for the Native Soft Delete engine and Mangle-on-Delete logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MongoCrudMethods } from "@src/databases/mongodb/methods/crud-methods";
import { safeQuery } from "@src/utils/security/safe-query";
import type { Model } from "mongoose";

// Mock safe-query
vi.mock("@src/utils/security/safe-query", () => ({
  safeQuery: vi.fn((query, _tenantId, options) => {
    const q = { ...query };
    if (!options?.includeDeleted) {
      q.isDeleted = { $ne: true };
    }
    return q;
  }),
}));

// Mock mongodb-utils
vi.mock("@src/databases/mongodb/methods/mongodb-utils", () => ({
  createDatabaseError: vi.fn((err) => err),
  generateId: vi.fn(() => "new-id"),
  processDates: vi.fn((doc) => doc),
}));

describe("Soft Delete Engine", () => {
  let mockModel: any;
  let crud: MongoCrudMethods<any>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Mongoose Model
    mockModel = {
      modelName: "TestModel",
      findOne: vi.fn(),
      find: vi.fn(),
      updateOne: vi.fn(),
      deleteOne: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      schema: {
        paths: {
          slug: { _userProvidedOptions: { unique: true } },
          title: { _userProvidedOptions: { unique: false } },
        },
      },
    };

    crud = new MongoCrudMethods(mockModel as unknown as Model<any>);
  });

  describe("Read Operations", () => {
    it("should automatically exclude deleted items by default", async () => {
      mockModel.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      await crud.findMany({});

      expect(safeQuery).toHaveBeenCalledWith(
        {},
        undefined,
        expect.objectContaining({ includeDeleted: undefined }),
      );
      // Mongoose find is called with (query, projection, options)
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: { $ne: true } }),
        "",
        expect.any(Object),
      );
    });

    it("should include deleted items when requested", async () => {
      mockModel.findOne.mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      });

      await crud.findOne({}, { includeDeleted: true });

      expect(safeQuery).toHaveBeenCalledWith(
        {},
        undefined,
        expect.objectContaining({ includeDeleted: true }),
      );
      // In our mock safeQuery, includeDeleted: true doesn't add the filter
      expect(mockModel.findOne).not.toHaveProperty("isDeleted");
    });
  });

  describe("Delete Operation (Mangle-on-Delete)", () => {
    it("should perform soft delete and mangle unique fields", async () => {
      const existingDoc = { _id: "123", slug: "my-slug", title: "My Title" };
      mockModel.findOne.mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(existingDoc),
      });
      mockModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await crud.delete("123" as any);

      expect(result.success).toBe(true);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "123" }),
        expect.objectContaining({
          $set: expect.objectContaining({
            isDeleted: true,
            slug: expect.stringMatching(/my-slug_DELETED_\d+/),
          }),
        }),
        expect.any(Object),
      );
      // Non-unique fields should NOT be mangled
      const updateSet = mockModel.updateOne.mock.calls[0][1].$set;
      expect(updateSet.title).toBeUndefined();
    });

    it("should perform hard delete if permanent flag is set", async () => {
      mockModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await crud.delete("123" as any, { permanent: true });

      expect(result.success).toBe(true);
      expect(mockModel.deleteOne).toHaveBeenCalled();
      expect(mockModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("Restore Operation (De-mangle & Collision Check)", () => {
    it("should restore and de-mangle unique fields", async () => {
      const deletedDoc = {
        _id: "123",
        slug: "my-slug_DELETED_1710793389",
        isDeleted: true,
      };
      // Mock first findOne (finding the doc to restore)
      mockModel.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(deletedDoc),
      });
      // Mock second findOne (collision check - should return null)
      mockModel.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      });
      mockModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await crud.restore("123" as any);

      expect(result.success).toBe(true);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            isDeleted: false,
            slug: "my-slug",
          }),
          $unset: { deletedAt: "", deletedBy: "" },
        }),
        expect.any(Object),
      );
    });

    it("should fail restore if a collision is detected", async () => {
      const deletedDoc = {
        _id: "123",
        slug: "my-slug_DELETED_1710793389",
        isDeleted: true,
      };
      const collidingDoc = { _id: "456", slug: "my-slug" };

      mockModel.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(deletedDoc),
      });
      mockModel.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(collidingDoc),
      });

      const result = await crud.restore("123" as any);

      if (!result.success) {
        expect(result.message).toContain("already exists");
      }
      expect(result.success).toBe(false);
      expect(mockModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
