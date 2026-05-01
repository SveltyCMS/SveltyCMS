/**
 * @file tests/bun/databases/db-interface.test.ts
 * @description Database-agnostic interface tests
 *
 * These tests verify that database adapters conform to the IDBAdapter interface
 * and handle operations correctly regardless of the underlying database technology.
 *
 * NOTE: TypeScript errors for 'bun:test' module are expected - it's a runtime module.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { DatabaseId, DatabaseResult, IDBAdapter } from "../../../src/databases/db-interface";

function normalizeStoredValue(value: any) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

describe("Database Interface Contract Tests", () => {
  let db: IDBAdapter | null = null;
  let currentDbType = process.env.DB_TYPE || "sqlite";

  beforeAll(async () => {
    // @ts-ignore - private.test.ts is generated at runtime in CI, not present at type-check time
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

    currentDbType =
      process.env.DB_TYPE ||
      privateConfig.DB_TYPE ||
      databaseConfig.type ||
      privateConfig.database?.type ||
      "sqlite";

    console.log(`DB Interface Test: Testing adapter for ${currentDbType}...`);

    if (currentDbType === "mongodb") {
      const { MongoDBAdapter } = await import("../../../src/databases/mongodb/mongo-db-adapter");
      db = new MongoDBAdapter();
    } else if (currentDbType === "mariadb") {
      const { MariaDBAdapter } = await import("../../../src/databases/mariadb/mariadb-adapter");
      db = new MariaDBAdapter() as any;
    } else if (currentDbType === "postgresql") {
      const { PostgreSQLAdapter } =
        await import("../../../src/databases/postgresql/postgres-adapter");
      db = new PostgreSQLAdapter() as any;
    } else {
      const { SQLiteAdapter } = await import("../../../src/databases/sqlite/adapter/index");
      db = new SQLiteAdapter() as any;
    }

    try {
      if (!db) throw new Error("Database adapter not initialized");

      console.log("DB Interface Test: Connecting...");

      const host =
        process.env.DB_HOST ||
        privateConfig.DB_HOST ||
        databaseConfig.host ||
        privateConfig.database?.host ||
        "127.0.0.1";

      const dbName =
        process.env.DB_NAME ||
        privateConfig.DB_NAME ||
        databaseConfig.name ||
        privateConfig.database?.name ||
        "sveltycms_test";

      const user =
        process.env.DB_USER ||
        privateConfig.DB_USER ||
        databaseConfig.user ||
        privateConfig.database?.user ||
        "";

      const pass =
        process.env.DB_PASSWORD ||
        privateConfig.DB_PASSWORD ||
        databaseConfig.password ||
        privateConfig.database?.password ||
        "";

      if (currentDbType === "mongodb") {
        const port =
          process.env.DB_PORT ||
          privateConfig.DB_PORT ||
          databaseConfig.port ||
          privateConfig.database?.port ||
          "27017";

        let connectionString = `mongodb://${host}:${port}/${dbName}`;

        if (user && pass) {
          const authSource = encodeURIComponent(
            process.env.DB_AUTH_SOURCE ||
              privateConfig.DB_AUTH_SOURCE ||
              databaseConfig.authSource ||
              dbName,
          );

          connectionString = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(
            pass,
          )}@${host}:${port}/${dbName}?authSource=${authSource}`;
        }

        await (db as any).connect(connectionString);
      } else if (currentDbType === "mariadb") {
        const port =
          process.env.DB_PORT ||
          privateConfig.DB_PORT ||
          databaseConfig.port ||
          privateConfig.database?.port ||
          "3306";

        let connectionString = `mariadb://${host}:${port}/${dbName}`;

        if (user && pass) {
          connectionString = `mariadb://${encodeURIComponent(user)}:${encodeURIComponent(
            pass,
          )}@${host}:${port}/${dbName}`;
        }

        await db.connect(connectionString);
      } else if (currentDbType === "postgresql") {
        const port =
          process.env.DB_PORT ||
          privateConfig.DB_PORT ||
          databaseConfig.port ||
          privateConfig.database?.port ||
          "5432";

        let connectionString = `postgres://${host}:${port}/${dbName}`;

        if (user && pass) {
          connectionString = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
            pass,
          )}@${host}:${port}/${dbName}`;
        }

        console.log("Postgres connecting to " + connectionString.replace(/:.+@/, ":****@"));
        await db.connect(connectionString);
        console.log("Postgres connected.");
      } else {
        const sqliteDbName =
          process.env.DB_NAME ||
          privateConfig.DB_NAME ||
          databaseConfig.name ||
          privateConfig.database?.name ||
          "sveltycms_test.db";

        await db.connect(sqliteDbName);
      }

      console.log("DB Interface Test: Initializing features...");

      await Promise.all([
        db.ensureAuth?.().then(() => console.log("ensureAuth done")),
        db.ensureMedia?.().then(() => console.log("ensureMedia done")),
        db.ensureContent?.().then(() => console.log("ensureContent done")),
        db.ensureSystem?.().then(() => console.log("ensureSystem done")),
        db.ensureMonitoring?.().then(() => console.log("ensureMonitoring done")),
      ]);

      console.log("DB Interface Test: All features initialized (if available)");
    } catch (err) {
      console.error("DB Interface Test Check: Failed to initialize features", err);
    }
  }, 60000);

  afterAll(async () => {
    try {
      if (db?.isConnected?.()) {
        await db.disconnect();
      }
    } catch (error) {
      console.warn("DB Interface Test: non-fatal disconnect error", error);
    }
  });

  describe("Connection Management", () => {
    it("should implement connect method", () => {
      expect(typeof db?.connect).toBe("function");
    });

    it("should implement disconnect method", () => {
      expect(typeof db?.disconnect).toBe("function");
    });

    it("should implement isConnected method", () => {
      expect(typeof db?.isConnected).toBe("function");
    });

    it("should implement getConnectionHealth method", () => {
      expect(typeof db?.getConnectionHealth).toBe("function");
    });

    it("should implement waitForConnection method", () => {
      if (db?.waitForConnection) {
        expect(typeof db.waitForConnection).toBe("function");
      }
    });
  });

  describe("CRUD Operations", () => {
    it("should implement findOne method", () => {
      expect(typeof db?.crud?.findOne).toBe("function");
    });

    it("should implement findMany method", () => {
      expect(typeof db?.crud?.findMany).toBe("function");
    });

    it("should implement insert method", () => {
      expect(typeof db?.crud?.insert).toBe("function");
    });

    it("should implement update method", () => {
      expect(typeof db?.crud?.update).toBe("function");
    });

    it("should implement delete method", () => {
      expect(typeof db?.crud?.delete).toBe("function");
    });

    it("should implement batch operations", () => {
      expect(typeof db?.crud?.findByIds).toBe("function");
      expect(typeof db?.crud?.insertMany).toBe("function");
      expect(typeof db?.crud?.updateMany).toBe("function");
      expect(typeof db?.crud?.deleteMany).toBe("function");
    });

    it("should implement upsert operations", () => {
      expect(typeof db?.crud?.upsert).toBe("function");
      expect(typeof db?.crud?.upsertMany).toBe("function");
    });

    it("should implement aggregation methods", () => {
      expect(typeof db?.crud?.count).toBe("function");
      expect(typeof db?.crud?.exists).toBe("function");
      expect(typeof db?.crud?.aggregate).toBe("function");
    });
  });

  describe("Authentication Interface", () => {
    it("should implement user management methods", () => {
      expect(typeof db?.auth?.createUser).toBe("function");
      expect(typeof db?.auth?.getUserById).toBe("function");
      expect(typeof db?.auth?.getUserByEmail).toBe("function");
      expect(typeof db?.auth?.updateUserAttributes).toBe("function");
      expect(typeof db?.auth?.deleteUser).toBe("function");
      expect(typeof db?.auth?.getAllUsers).toBe("function");
    });

    it("should implement session management methods", () => {
      expect(typeof db?.auth?.createSession).toBe("function");
      expect(typeof db?.auth?.validateSession).toBe("function");
      expect(typeof db?.auth?.deleteSession).toBe("function");
      expect(typeof db?.auth?.deleteExpiredSessions).toBe("function");
      expect(typeof db?.auth?.invalidateAllUserSessions).toBe("function");
    });

    it("should implement token management methods", () => {
      expect(typeof db?.auth?.createToken).toBe("function");
      expect(typeof db?.auth?.validateToken).toBe("function");
      expect(typeof db?.auth?.consumeToken).toBe("function");
      expect(typeof db?.auth?.deleteExpiredTokens).toBe("function");
    });
  });

  describe("DatabaseResult Contract", () => {
    it("should return success result with data", () => {
      const successResult: DatabaseResult<string> = {
        success: true,
        data: "test-data",
      };

      expect(successResult.success).toBe(true);
      expect(successResult.data).toBe("test-data");
    });

    it("should return failure result with error", () => {
      const failureResult: DatabaseResult<string> = {
        success: false,
        message: "Operation failed",
        error: {
          code: "TEST_ERROR",
          message: "Test error message",
        },
      };

      expect(failureResult.success).toBe(false);
      expect((failureResult as any).error.code).toBe("TEST_ERROR");
      expect((failureResult as any).error.message).toBe("Test error message");
    });

    it("should include optional metadata in success result", () => {
      const resultWithMeta: DatabaseResult<string> = {
        success: true,
        data: "test",
        meta: {
          executionTime: 100,
          cached: false,
        },
      };

      expect(resultWithMeta.meta?.executionTime).toBe(100);
      expect(resultWithMeta.meta?.cached).toBe(false);
    });
  });

  describe("Batch Operations Interface", () => {
    it("should implement batch execution method", () => {
      expect(typeof db?.batch?.execute).toBe("function");
    });

    it("should implement bulkInsert method", () => {
      expect(typeof db?.batch?.bulkInsert).toBe("function");
    });

    it("should implement bulkUpdate method", () => {
      expect(typeof db?.batch?.bulkUpdate).toBe("function");
    });

    it("should implement bulkDelete method", () => {
      expect(typeof db?.batch?.bulkDelete).toBe("function");
    });

    it("should implement bulkUpsert method", () => {
      expect(typeof db?.batch?.bulkUpsert).toBe("function");
    });
  });

  describe("Query Builder Interface", () => {
    it("should implement queryBuilder method", () => {
      expect(typeof db?.queryBuilder).toBe("function");
    });

    it("should return QueryBuilder with required methods", async () => {
      if (db?.queryBuilder) {
        await db.ensureCollections?.();

        const builder = db.queryBuilder("test_collection");

        expect(typeof builder.where).toBe("function");
        expect(typeof builder.whereIn).toBe("function");
        expect(typeof builder.whereNotIn).toBe("function");

        expect(typeof builder.limit).toBe("function");
        expect(typeof builder.skip).toBe("function");
        expect(typeof builder.paginate).toBe("function");

        expect(typeof builder.sort).toBe("function");
        expect(typeof builder.orderBy).toBe("function");

        expect(typeof builder.select).toBe("function");
        expect(typeof builder.exclude).toBe("function");

        expect(typeof builder.count).toBe("function");
        expect(typeof builder.exists).toBe("function");
        expect(typeof builder.execute).toBe("function");
        expect(typeof builder.findOne).toBe("function");
      }
    });
  });

  describe("Content Management Interface", () => {
    it("should implement content node operations", () => {
      expect(typeof db?.content?.nodes?.getStructure).toBe("function");
      expect(typeof db?.content?.nodes?.create).toBe("function");
      expect(typeof db?.content?.nodes?.createMany).toBe("function");
      expect(typeof db?.content?.nodes?.update).toBe("function");
      expect(typeof db?.content?.nodes?.delete).toBe("function");
    });

    it("should implement draft operations", () => {
      expect(typeof db?.content?.drafts?.create).toBe("function");
      expect(typeof db?.content?.drafts?.update).toBe("function");
      expect(typeof db?.content?.drafts?.publish).toBe("function");
      expect(typeof db?.content?.drafts?.getForContent).toBe("function");
      expect(typeof db?.content?.drafts?.delete).toBe("function");
    });

    it("should implement revision operations", () => {
      expect(typeof db?.content?.revisions?.create).toBe("function");
      expect(typeof db?.content?.revisions?.getHistory).toBe("function");
      expect(typeof db?.content?.revisions?.restore).toBe("function");
      expect(typeof db?.content?.revisions?.cleanup).toBe("function");
    });
  });

  describe("Media Management Interface", () => {
    it("should implement file operations", () => {
      expect(typeof db?.media?.files?.upload).toBe("function");
      expect(typeof db?.media?.files?.uploadMany).toBe("function");
      expect(typeof db?.media?.files?.delete).toBe("function");
      expect(typeof db?.media?.files?.deleteMany).toBe("function");
      expect(typeof db?.media?.files?.search).toBe("function");
    });

    it("should implement folder operations", () => {
      expect(typeof db?.media?.folders?.create).toBe("function");
      expect(typeof db?.media?.folders?.delete).toBe("function");
      expect(typeof db?.media?.folders?.getTree).toBe("function");
      expect(typeof db?.media?.folders?.move).toBe("function");
    });
  });

  describe("Theme Management Interface", () => {
    it("should implement theme operations", () => {
      expect(typeof db?.system?.themes?.getActive).toBe("function");
      expect(typeof db?.system?.themes?.setDefault).toBe("function");
      expect(typeof db?.system?.themes?.install).toBe("function");
      expect(typeof db?.system?.themes?.uninstall).toBe("function");
      expect(typeof db?.system?.themes?.update).toBe("function");
      expect(typeof db?.system?.themes?.getAllThemes).toBe("function");
      expect(typeof db?.system?.themes?.storeThemes).toBe("function");
      expect(typeof db?.system?.themes?.ensure).toBe("function");
    });
  });

  describe("Virtual Folder Interface", () => {
    it("should implement virtual folder operations", () => {
      expect(typeof db?.system?.virtualFolder?.create).toBe("function");
      expect(typeof db?.system?.virtualFolder?.getById).toBe("function");
      expect(typeof db?.system?.virtualFolder?.getByParentId).toBe("function");
      expect(typeof db?.system?.virtualFolder?.getAll).toBe("function");
      expect(typeof db?.system?.virtualFolder?.update).toBe("function");
      expect(typeof db?.system?.virtualFolder?.addToFolder).toBe("function");
      expect(typeof db?.system?.virtualFolder?.getContents).toBe("function");
      expect(typeof db?.system?.virtualFolder?.ensure).toBe("function");
      expect(typeof db?.system?.virtualFolder?.delete).toBe("function");
      expect(typeof db?.system?.virtualFolder?.exists).toBe("function");
    });
  });

  describe("Widget Management Interface", () => {
    it("should implement widget operations", () => {
      expect(typeof db?.system?.widgets?.register).toBe("function");
      expect(typeof db?.system?.widgets?.findAll).toBe("function");
      expect(typeof db?.system?.widgets?.getActiveWidgets).toBe("function");
      expect(typeof db?.system?.widgets?.activate).toBe("function");
      expect(typeof db?.system?.widgets?.deactivate).toBe("function");
      expect(typeof db?.system?.widgets?.update).toBe("function");
    });
  });

  describe("System Preferences Interface", () => {
    it("should implement preference operations", () => {
      expect(typeof db?.system?.preferences?.get).toBe("function");
      expect(typeof db?.system?.preferences?.getMany).toBe("function");
      expect(typeof db?.system?.preferences?.set).toBe("function");
      expect(typeof db?.system?.preferences?.setMany).toBe("function");
      expect(typeof db?.system?.preferences?.delete).toBe("function");
      expect(typeof db?.system?.preferences?.clear).toBe("function");
    });
  });

  describe("Utility Methods Interface", () => {
    it("should implement utility methods", () => {
      expect(typeof db?.utils?.generateId).toBe("function");
      expect(typeof db?.utils?.validateId).toBe("function");
      expect(typeof db?.utils?.normalizePath).toBe("function");
    });

    it("should generate non-empty unique IDs", () => {
      if (!db?.utils?.generateId) return;

      const id = db.utils.generateId();
      const secondId = db.utils.generateId();

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toBe(secondId);

      if (db.utils.validateId) {
        const validationResult = db.utils.validateId(id);
        expect(typeof validationResult).toBe("boolean");
      }
    });
  });

  describe("Functional Core Operations", () => {
    const TEST_TENANT = "test_tenant_alpha" as any;
    const testUserEmail = `test-${Date.now()}@contract.com`;
    let testUserId: DatabaseId;

    it("should handle full Auth user lifecycle", async () => {
      if (!db?.auth) return;

      if (currentDbType === "mongodb") {
        console.warn("Skipping generic auth lifecycle in db-interface for MongoDB adapter.");
        return;
      }

      const createRes = await db.auth.createUser({
        email: testUserEmail,
        username: "contract_user",
        password: "Password123!",
        isAdmin: false,
        tenantId: TEST_TENANT,
      });

      expect(createRes.success).toBe(true);
      if (!createRes.success) throw new Error("Create user failed");

      expect(createRes.data.email).toBe(testUserEmail);
      testUserId = createRes.data._id;

      const fetchRes = await db.auth.getUserById(testUserId, { tenantId: TEST_TENANT });
      expect(fetchRes.success).toBe(true);
      if (!fetchRes.success) throw new Error("Fetch user failed");

      expect(fetchRes.data?._id).toBe(testUserId);
      expect(fetchRes.data?.email).toBe(testUserEmail);

      const updateRes = await db.auth.updateUserAttributes(
        testUserId,
        {
          firstName: "Contract",
          lastName: "Verified",
        },
        { tenantId: TEST_TENANT },
      );

      expect(updateRes.success).toBe(true);
      if (!updateRes.success) throw new Error("Update user failed");

      const updatedUserRes = await db.auth.getUserById(testUserId, {
        tenantId: TEST_TENANT,
      });

      expect(updatedUserRes.success).toBe(true);
      if (!updatedUserRes.success) throw new Error("Fetch updated user failed");

      expect(updatedUserRes.data?.firstName).toBe("Contract");

      const emailRes = await db.auth.getUserByEmail({
        email: testUserEmail,
        tenantId: TEST_TENANT,
      });

      expect(emailRes.success).toBe(true);
      if (!emailRes.success) throw new Error("Fetch by email failed");

      expect(emailRes.data?.firstName).toBe("Contract");

      const deleteRes = await db.auth.deleteUser(testUserId, { tenantId: TEST_TENANT });
      expect(deleteRes.success).toBe(true);

      const verifyRes = await db.auth.getUserById(testUserId, { tenantId: TEST_TENANT });
      expect(verifyRes.success).toBe(true);
      if (!verifyRes.success) throw new Error("Verify deletion failed");

      expect(verifyRes.data).toBeNull();
    });

    it("should handle standardized CRUD round-trips using system_preferences", async () => {
      if (!db?.crud) return;

      if (currentDbType === "mongodb") {
        console.warn("Skipping generic CRUD round-trip in db-interface for MongoDB adapter.");
        return;
      }

      const collection = "system_preferences";
      const testId = `pref-${Date.now()}` as any;
      const testDoc = {
        _id: testId as DatabaseId,
        key: "test_interface_key",
        value: { data: "test_value_data" },
        scope: "system",
        visibility: "private",
        tenantId: TEST_TENANT,
      };

      const insertRes = await db.crud.insert(collection, testDoc as any, {
        tenantId: TEST_TENANT,
      });

      expect(insertRes.success).toBe(true);
      if (!insertRes.success) throw new Error("Insert failed: " + insertRes.message);

      const docId = insertRes.data._id;
      expect(docId).toBeDefined();

      const findRes = await db.crud.findOne(collection, {
        _id: docId,
        tenantId: TEST_TENANT,
      } as any);

      expect(findRes.success).toBe(true);
      if (!findRes.success || !findRes.data) throw new Error("FindOne failed");

      expect((findRes.data as any).key).toBe("test_interface_key");

      const updateRes = await db.crud.update(
        collection,
        docId,
        {
          value: { data: "updated_value_data" },
        } as any,
        { tenantId: TEST_TENANT },
      );

      expect(updateRes.success).toBe(true);
      if (!updateRes.success) throw new Error("Update failed");

      const refetchAfterUpdate = await db.crud.findOne(collection, {
        _id: docId,
        tenantId: TEST_TENANT,
      } as any);

      expect(refetchAfterUpdate.success).toBe(true);
      if (!refetchAfterUpdate.success || !refetchAfterUpdate.data) {
        throw new Error("Refetch after update failed");
      }

      const updatedValue = normalizeStoredValue((refetchAfterUpdate.data as any).value);
      expect(updatedValue?.data ?? updatedValue).toBe("updated_value_data");

      const countRes = await db.crud.count(collection, { key: "test_interface_key" } as any, {
        tenantId: TEST_TENANT,
      });

      expect(countRes.success).toBe(true);
      if (!countRes.success) throw new Error("Count failed");

      expect(countRes.data).toBeGreaterThan(0);

      const existsRes = await db.crud.exists(collection, { _id: docId } as any, {
        tenantId: TEST_TENANT,
      });

      expect(existsRes.success).toBe(true);
      if (!existsRes.success) throw new Error("Exists failed");

      expect(existsRes.data).toBe(true);

      const deleteRes = await db.crud.delete(collection, docId, {
        tenantId: TEST_TENANT,
      });

      expect(deleteRes.success).toBe(true);
    });
  });

  describe("Utility & Consistency Contract", () => {
    it("should generate unique IDs consistently", () => {
      if (!db?.utils) return;

      const id = db.utils.generateId();
      const secondId = db.utils.generateId();

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toBe(secondId);
    });

    it("should normalize paths according to system spec", () => {
      if (!db?.utils) return;

      const raw = "//media///folder/subfolder/";
      const expected = "media/folder/subfolder";

      const normalized = db.utils.normalizePath(raw).replace(/^\/+|\/+$/g, "");
      expect(normalized).toBe(expected);
    });
  });
});
