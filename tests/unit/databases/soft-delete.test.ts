/**
 * @file tests/unit/databases/soft-delete.test.ts
 * @description Unit tests for the Native Soft Delete engine and Mangle-on-Delete logic.
 *
 * Mongoose is fully mocked so this suite runs under Bun (real mongoose → bson →
 * node:v8 isBuildingSnapshot is not implemented in Bun).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─── Mongoose stub (must be registered before any mongodb/* import) ─────────
vi.mock("mongoose", () => {
  class MongoServerError extends Error {
    code?: number;
    constructor(message?: string, code?: number) {
      super(message);
      this.name = "MongoServerError";
      this.code = code;
    }
  }

  const mongooseStub = {
    mongo: { MongoServerError },
    Types: { ObjectId: class ObjectId {} },
    Schema: class Schema {},
    model: vi.fn(),
    connection: {},
  };

  return {
    default: mongooseStub,
    ...mongooseStub,
    Model: class Model {},
    Schema: mongooseStub.Schema,
    Types: mongooseStub.Types,
  };
});

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

// Mock mongodb-utils (relative import from crud-methods)
vi.mock("@src/databases/mongodb/mongodb-utils", () => ({
  createDatabaseError: vi.fn((error, code, message) => ({
    code,
    message,
    details: error instanceof Error ? error.message : String(error),
    originalCode: (error as any)?.code,
  })),
  generateId: vi.fn(() => "new-id"),
  processDates: vi.fn((doc) => doc),
}));

// Relative path used by crud-methods itself (Bun mock.module matches specifier)
vi.mock("./mongodb-utils", () => ({
  createDatabaseError: vi.fn((error, code, message) => ({
    code,
    message,
    details: error instanceof Error ? error.message : String(error),
    originalCode: (error as any)?.code,
  })),
  generateId: vi.fn(() => "new-id"),
  processDates: vi.fn((doc) => doc),
}));

describe("Soft Delete Engine", () => {
  let MongoCrudMethods: any;
  let mockModel: any;
  let crud: any;

  beforeAll(async () => {
    // Dynamic import after mongoose mock is registered
    const mod = await import("@src/databases/mongodb/crud-methods");
    MongoCrudMethods = mod.MongoCrudMethods;
  });

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
      findOneAndUpdate: vi.fn(),
      schema: {
        paths: {
          slug: { _userProvidedOptions: { unique: true } },
          title: { _userProvidedOptions: { unique: false } },
        },
        indexes: vi.fn(() => []),
      },
    };

    const mockAdapter = { mapQuery: vi.fn((q) => q) };
    crud = new MongoCrudMethods(mockModel, mockAdapter);
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

      const { safeQuery } = await import("@src/utils/security/safe-query");
      expect(safeQuery).toHaveBeenCalledWith(
        {},
        undefined,
        expect.objectContaining({ includeDeleted: undefined }),
      );
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

      const { safeQuery } = await import("@src/utils/security/safe-query");
      expect(safeQuery).toHaveBeenCalledWith(
        {},
        undefined,
        expect.objectContaining({ includeDeleted: true }),
      );
      expect(mockModel.findOne).toHaveBeenCalledWith({}, undefined, expect.any(Object));
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
        expect.anything(),
      );
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

      mockModel.findOne.mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(deletedDoc),
      });

      mockModel.findOneAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...deletedDoc,
          slug: "my-slug",
          isDeleted: false,
        }),
      });

      const result = await crud.restore("123" as any);

      expect(result.success).toBe(true);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            isDeleted: false,
            slug: "my-slug",
          }),
          $unset: { deletedAt: "", deletedBy: "" },
        }),
        expect.objectContaining({
          runValidators: true,
        }),
      );
    });

    it("should fail restore if a collision is detected via validators", async () => {
      const deletedDoc = {
        _id: "123",
        slug: "my-slug_DELETED_1710793389",
        isDeleted: true,
      };

      mockModel.findOne.mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(deletedDoc),
      });

      // Simulate Mongoose Duplicate Key Error
      const mongoError = {
        name: "MongoServerError",
        message: "E11000 duplicate key error collection",
        code: 11000,
      };

      mockModel.findOneAndUpdate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(mongoError),
      });

      const result = await crud.restore("123" as any);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("COLLISION");
    });
  });
});
