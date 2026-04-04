/**
 * @file tests/integration/databases/mongodb-adapter.test.ts
 * @description MongoDB adapter implementation tests
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import mongoose from "mongoose";

// Load config at top-level (Bun supports top-level await) to determine skip status
// @ts-ignore - runtime file
const { privateEnv } = (await import("../../../config/private.test").catch(() => ({
  privateEnv: null,
}))) as any;
const isMongo = (privateEnv as any)?.DB_TYPE === "mongodb";

// Use conditional describe to show skip status in runner output
describe(
  isMongo
    ? "MongoDB Adapter Functional Tests"
    : "MongoDB Adapter Functional Tests (SKIP: Not MongoDB)",
  () => {
    let db: any = null;
    const testCollection = `test_collection_${Date.now()}`;
    let adapterClass: any;

    beforeAll(async () => {
      if (!isMongo) {
        return;
      }

      // Import modules dynamically to bypass mocks
      const adapterModule = await import("../../../src/databases/mongodb/mongo-db-adapter");
      adapterClass = adapterModule.MongoDBAdapter;

      // Initialize adapter
      db = new adapterClass();

      // Construct connection string using environment settings
      const dbName = `${(privateEnv as any).DB_NAME || "sveltycms_test"}_functional`;
      let connectionString = `mongodb://${(privateEnv as any).DB_HOST}:${(privateEnv as any).DB_PORT}/${dbName}`;

      if ((privateEnv as any).DB_USER && (privateEnv as any).DB_PASSWORD) {
        connectionString = `mongodb://${(privateEnv as any).DB_USER}:${(privateEnv as any).DB_PASSWORD}@${(privateEnv as any).DB_HOST}:${(privateEnv as any).DB_PORT}/${dbName}?authSource=admin`;
      }

      // Set longer timeout for CI environments
      const connectOptions = {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      };

      try {
        await db.connect(connectionString, connectOptions);

        // Verify write access by attempting a simple operation
        const insertResult = await db.crud.insert(testCollection, {
          _test: true,
          timestamp: Date.now(),
        });
        if (insertResult.success) {
          await db.crud.deleteMany(testCollection, { _test: true }); // Clean up
        } else {
          const errorMsg = `MongoDB Write Verification Failed: ${insertResult.message || insertResult.error || "Unknown error"}`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        const errorMsg = `MongoDB Connection Failed: ${err.message}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    });

    afterAll(async () => {
      if (mongoose.connection) {
        // Cleanup test collection
        if (db && mongoose.connection.db) {
          await mongoose.connection.db.dropCollection(testCollection).catch(() => {});
        }
        await mongoose.disconnect();
      }
    });

    describe("Model Registration", () => {
      it("should have all features initialized", () => {
        if (!isMongo) return;
        expect(db).toBeDefined();
        // Check feature initialization status
        const featureInit = (db as any)._featureInit;
        expect(featureInit).toBeDefined();
        // At minimum, CRUD should be initialized after connect
        expect(featureInit.crud).toBe(true);
      });
    });

    describe("CRUD Operations (via db.crud)", () => {
      let createdId: string;

      it("should insert document and return with generated ID", async () => {
        if (!isMongo) return;
        // MongoDBAdapter.crud.insert wrapper expects dynamic collection handling or known repositories.
        // The generic 'crud' interface in MongoDBAdapter relies on `_getRepository(coll)`.
        // If 'test_collection' isn't a known repository, `insert` might fail or we need to look at how it handles dynamic collections.
        // Looking at code: `_getRepository(coll)` checks `this._repositories`.
        // It seems the adapter heavily relies on PRE-DEFINED collections (nodes, drafts, etc).
        // However, creating a new collection on the fly might not be supported by `_getRepository`.
        // Lets check `_getRepository` implementation? It wasn't shown in the view, but `_repositories` map suggests strict collection set.
        // BUT `_collectionMethods` suggests dynamic collections.

        // For these tests to work on arbitrary collections, we might need to use the `collection` interface if `crud` is strict.
        // But `crud` is what we want to test.
        // Let's try to usage the 'widgets' collection as a test bed since it's standard, or 'nodes'.
        // Actually, let's use the 'widgets' collection which corresponds to WidgetModel.

        // WE MUST use one of the supported repositories for CRUD testing via `db.crud`: 'nodes', 'drafts', 'revisions', 'websiteTokens', 'media'.
        // 'websiteTokens' seems simplest schema-wise.

        const tokenData = {
          token: `test-token-${Date.now()}`,
          role: "admin",
          createdBy: "test-user",
          name: "Test Token",
        };

        const result = await db.crud.insert("websiteTokens", tokenData);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.token).toBe(tokenData.token);
        expect((result.data as any)._id).toBeDefined();
        createdId = (result.data as any)._id;
      });

      it("should find document by ID", async () => {
        if (!isMongo) return;
        expect(createdId).toBeDefined();
        const result = await db.crud.findOne("websiteTokens", {
          _id: createdId,
        });
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect((result.data as any).token).toBeDefined();
      });

      it("should update document by ID", async () => {
        if (!isMongo) return;
        expect(createdId).toBeDefined();
        const updates = { name: "Updated Name" };
        const result = await db.crud.update("websiteTokens", createdId, updates);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe("Updated Name");
      });

      it("should delete document by ID", async () => {
        if (!isMongo) return;
        expect(createdId).toBeDefined();
        const result = await db.crud.delete("websiteTokens", createdId);
        expect(result.success).toBe(true);

        // Verify deletion
        const check = await db.crud.findOne("websiteTokens", {
          _id: createdId,
        });
        expect(check.success).toBe(true);
        expect(check.data).toBeNull();
      });
    });

    describe("Query Builder", () => {
      // Test using 'websiteTokens' again as it supports simple queries

      it("should build simple where query", async () => {
        if (!isMongo) return;

        // Ensure collections are initialized before using queryBuilder
        await db.ensureCollections();

        // Use a test collection that queryBuilder can work with
        const testCollection = "test_query_builder";

        // Insert some data first using crud (which creates collection if needed)
        const doc1 = { name: "Item A", status: "active" };
        const doc2 = { name: "Item B", status: "inactive" };
        await db.crud.insert(testCollection, doc1);
        await db.crud.insert(testCollection, doc2);

        // Ensure QueryBuilder infra is ready
        await db.ensureCollections();

        // Query using queryBuilder
        const qb = db.queryBuilder(testCollection);
        const result = await qb.where({ status: "active" }).execute();
        expect(result.success).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBeGreaterThanOrEqual(1);
        expect(result.data.some((item: any) => item.name === "Item A")).toBe(true);
      });
    });
  },
);
