/**
 * @file tests/integration/databases/mongodb-adapter.test.ts
 * @description
 * Robust integration tests for the MongoDB adapter.
 *
 * This suite validates the functional contract of the MongoDB adapter,
 * specifically testing CRUD operations via the IDBAdapter interface
 * and the NoSQL-specific behaviors of the QueryBuilder.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import mongoose from "mongoose";

// @ts-ignore - optional test config generated at runtime
const imported = await import("../../../config/private.test").catch(() => ({
  privateEnv: {} as any,
  privateConfig: {} as any,
  database: {} as any,
  default: {} as any,
}));

const privateConfig =
  (imported as any).privateEnv ||
  (imported as any).privateConfig ||
  (imported as any).default ||
  {};

const databaseConfig =
  (imported as any).database || privateConfig.database || privateConfig.db || {};

const privateEnv = {
  ...privateConfig,
  DB_TYPE: process.env.DB_TYPE || privateConfig.DB_TYPE || databaseConfig.type,
  DB_HOST: process.env.DB_HOST || privateConfig.DB_HOST || databaseConfig.host || "127.0.0.1",
  DB_PORT: process.env.DB_PORT || privateConfig.DB_PORT || databaseConfig.port || "27017",
  DB_NAME: process.env.DB_NAME || privateConfig.DB_NAME || databaseConfig.name || "sveltycms_test",
  DB_USER: process.env.DB_USER || privateConfig.DB_USER || databaseConfig.user || "",
  DB_PASSWORD:
    process.env.DB_PASSWORD || privateConfig.DB_PASSWORD || databaseConfig.password || "",
  DB_AUTH_SOURCE:
    process.env.DB_AUTH_SOURCE || privateConfig.DB_AUTH_SOURCE || databaseConfig.authSource || "",
} as any;

console.log("DEBUG: process.env.DB_TYPE =", process.env.DB_TYPE);
console.log("DEBUG: privateEnv.DB_TYPE =", privateEnv.DB_TYPE);

const isMongo = privateEnv.DB_TYPE === "mongodb";
const describeMongo = isMongo ? describe : describe.skip;

function buildMongoUri(authSource?: string) {
  const host = privateEnv.DB_HOST || "127.0.0.1";
  let port = privateEnv.DB_PORT || "27017";

  // Defensive guard in case config/private.test.ts was generated from another DB job.
  if (port === 3306 || port === "3306") {
    port = "27017";
  }

  // IMPORTANT: use the same DB name as CI.
  // Do not append "_integration", because CI creates the Mongo user for sveltycms_test.
  const dbName = privateEnv.DB_NAME || "sveltycms_test";

  if (privateEnv.DB_USER && privateEnv.DB_PASSWORD) {
    const user = encodeURIComponent(privateEnv.DB_USER);
    const password = encodeURIComponent(privateEnv.DB_PASSWORD);
    const source = encodeURIComponent(authSource || privateEnv.DB_AUTH_SOURCE || dbName);

    return `mongodb://${user}:${password}@${host}:${port}/${dbName}?authSource=${source}`;
  }

  return `mongodb://${host}:${port}/${dbName}`;
}

describeMongo("MongoDB Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_mongo" as any as DatabaseId;

  beforeAll(async () => {
    if (!isMongo) return;

    try {
      const { MongoDBAdapter } = await import("../../../src/databases/mongodb/mongo-db-adapter");
      db = new MongoDBAdapter();

      if (!db) {
        throw new Error("Failed to initialize MongoDB adapter");
      }

      const dbName = privateEnv.DB_NAME || "sveltycms_test";
      const primaryUri = buildMongoUri(dbName);
      const adminFallbackUri = buildMongoUri("admin");
      const noAuthUri = buildMongoUri(undefined).replace(/\/\/[^:@/]+:[^@/]+@/, "//").replace(/\?authSource=.*/, "");

      console.log(
        "DEBUG: Attempting MongoDB connection to:",
        primaryUri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@"),
      );

      let result = await db.connect(primaryUri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      } as any);

      if (!result?.success && privateEnv.DB_USER && privateEnv.DB_PASSWORD) {
        console.warn("DEBUG: MongoDB app-db auth failed. Trying admin authSource fallback...");

        await db.disconnect?.().catch(() => {});
        result = await db.connect(adminFallbackUri, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        } as any);
      }

      if (!result?.success && !privateEnv.DB_USER && !privateEnv.DB_PASSWORD) {
        console.warn("DEBUG: MongoDB unauthenticated connection fallback...");

        await db.disconnect?.().catch(() => {});
        result = await db.connect(noAuthUri, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        } as any);
      }

      if (!result?.success) {
        throw new Error(`Failed to connect to MongoDB: ${result?.message || "unknown error"}`);
      }

      console.log("DEBUG: MongoDB Connected successfully");
      console.log("DEBUG: Mongoose readyState =", mongoose.connection.readyState);
      console.log("DEBUG: Mongoose DB Name =", mongoose.connection.name);
      console.log("DEBUG: Mongoose Host =", mongoose.connection.host);
      console.log("DEBUG: Mongoose Port =", mongoose.connection.port);

      await db.ensureSystem?.();
      await db.ensureContent?.();
      await db.ensureMedia?.();
      await db.ensureAuth?.();
    } catch (err) {
      console.error("MongoDB setup failed.", err);

      if (process.env.CI === "true") {
        throw err;
      }

      db = null;
    }
  }, 60000);

  afterAll(async () => {
    try {
      if (db?.crud) {
        await db.crud.deleteMany("system_preferences", { tenantId: TEST_TENANT } as any).catch(
          () => {},
        );
        await db.crud.deleteMany("test_nosql_query", { tenantId: TEST_TENANT } as any).catch(
          () => {},
        );
      }

      if (db?.isConnected?.()) {
        await db.disconnect();
      }
    } catch (error) {
      console.warn("MongoDB cleanup failed non-fatally:", error);
    }
  });

  describe("Connection & Setup", () => {
    it("should report connectivity correctly", () => {
      if (!db) return;
      expect(db.isConnected()).toBe(true);
    });

    it("should have CRUD initialized", () => {
      if (!db) return;
      expect(db.crud).toBeDefined();
    });
  });

  describe("Functional CRUD Operations", () => {
    const testCollection = "system_preferences";
    let createdId: DatabaseId;

    it("should handle full document lifecycle including metadata", async () => {
      if (!db) return;

      const testId = `pref-mongo-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: testId,
        key: "test_mongo_key",
        value: { adapter: "mongodb", validated: true },
        scope: "test",
        visibility: "private",
        tenantId: TEST_TENANT,
      };

      const insertRes = await db.crud.insert(testCollection, testDoc as any, {
        tenantId: TEST_TENANT,
      });

      console.log("DEBUG 1: Insert Result:", JSON.stringify(insertRes, null, 2));

      expect(insertRes.success).toBe(true);
      if (!insertRes.success || !insertRes.data) {
        throw new Error(`Mongo insert failed: ${(insertRes as any).message || "unknown error"}`);
      }

      createdId = (insertRes.data as any)._id;
      expect(createdId).toBeDefined();
      expect((insertRes.data as any).key).toBe("test_mongo_key");

      const findRes = await db.crud.findOne(testCollection, {
        _id: createdId as any,
        tenantId: TEST_TENANT,
      } as any);

      console.log("DEBUG 2: FindOne Result:", JSON.stringify(findRes, null, 2));

      expect(findRes.success).toBe(true);
      if (!findRes.success || !findRes.data) {
        throw new Error(`Mongo findOne failed: ${(findRes as any).message || "document not found"}`);
      }

      expect((findRes.data as any).value.adapter).toBe("mongodb");

      const updateRes = await db.crud.update(
        testCollection,
        createdId as any,
        {
          value: { adapter: "mongodb", validated: false, updated: true },
        } as any,
        { tenantId: TEST_TENANT },
      );

      console.log("DEBUG 3: Update Result:", JSON.stringify(updateRes, null, 2));

      expect(updateRes.success).toBe(true);
      if (!updateRes.success) {
        throw new Error(`Mongo update failed: ${(updateRes as any).message || "unknown error"}`);
      }

      const refetchRes = await db.crud.findOne(testCollection, {
        _id: createdId as any,
        tenantId: TEST_TENANT,
      } as any);

      expect(refetchRes.success).toBe(true);
      if (!refetchRes.success || !refetchRes.data) {
        throw new Error(`Mongo refetch failed after update: ${(refetchRes as any).message || "not found"}`);
      }

      expect((refetchRes.data as any).value.updated).toBe(true);

      const countRes = await db.crud.count(testCollection, {
        scope: "test",
        tenantId: TEST_TENANT,
      } as any);

      console.log("DEBUG 4: Count Result:", JSON.stringify(countRes, null, 2));

      expect(countRes.success).toBe(true);
      if (!countRes.success) {
        throw new Error(`Mongo count failed: ${(countRes as any).message || "unknown error"}`);
      }

      expect(countRes.data).toBeGreaterThan(0);

      const existsRes = await db.crud.exists(
        testCollection,
        { _id: createdId as any } as any,
        {
          tenantId: TEST_TENANT,
        },
      );

      expect(existsRes.success).toBe(true);
      if (!existsRes.success) {
        throw new Error(`Mongo exists failed: ${(existsRes as any).message || "unknown error"}`);
      }

      expect(existsRes.data).toBe(true);

      const deleteRes = await db.crud.delete(testCollection, createdId, {
        tenantId: TEST_TENANT,
      });

      expect(deleteRes.success).toBe(true);
      if (!deleteRes.success) {
        throw new Error(`Mongo delete failed: ${(deleteRes as any).message || "unknown error"}`);
      }

      const verifyRes = await db.crud.findOne(
        testCollection,
        { _id: createdId as any } as any,
        {
          tenantId: TEST_TENANT,
        },
      );

      expect(verifyRes.success).toBe(true);
      if (verifyRes.success) {
        expect(verifyRes.data).toBeNull();
      }
    });
  });

  describe("NoSQL Query Building", () => {
    it("should support $in operator via queryBuilder", async () => {
      if (!db) return;

      const coll = "test_nosql_query";

      await db.crud.deleteMany(coll, { tenantId: TEST_TENANT } as any).catch(() => {});

      const insertA = await db.crud.insert(
        coll,
        { name: "A", val: 1, tenantId: TEST_TENANT } as any,
        { tenantId: TEST_TENANT },
      );

      const insertB = await db.crud.insert(
        coll,
        { name: "B", val: 2, tenantId: TEST_TENANT } as any,
        { tenantId: TEST_TENANT },
      );

      const insertC = await db.crud.insert(
        coll,
        { name: "C", val: 3, tenantId: TEST_TENANT } as any,
        { tenantId: TEST_TENANT },
      );

      expect(insertA.success).toBe(true);
      expect(insertB.success).toBe(true);
      expect(insertC.success).toBe(true);

      const qb = db.queryBuilder(coll);
      const res = await qb.where({ val: { $in: [1, 3] }, tenantId: TEST_TENANT } as any).execute();

      console.log("DEBUG 5: QueryBuilder Result:", JSON.stringify(res, null, 2));

      expect(res.success).toBe(true);
      if (!res.success || !res.data) {
        throw new Error(`Mongo queryBuilder failed: ${(res as any).message || "unknown error"}`);
      }

      expect(res.data.length).toBe(2);

      const names = res.data.map((item: any) => item.name);
      expect(names).toContain("A");
      expect(names).toContain("C");

      await db.crud.deleteMany(coll, { tenantId: TEST_TENANT } as any);
    });
  });
});
