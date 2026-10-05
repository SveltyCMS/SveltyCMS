/**
 * @file tests/unit/databases/multi-adapter-transaction-parity.test.ts
 * @description Unit tests for cross-adapter transaction parity, domain proxy auto-injection,
 * and getVersion caching across MariaDB, SQLite, and MongoDB adapters.
 */

import { describe, it, expect, vi } from "vitest";
import { TransactionModule as MariaTransactionModule } from "@src/databases/mariadb/transaction-module";
import { TransactionModule as SqliteTransactionModule } from "@src/databases/sqlite/transaction-module";
import { MongoTransactionModule } from "@src/databases/mongodb/transaction-module";
import { MariaDBAdapter } from "@src/databases/mariadb/mariadb-adapter";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import { MongoDBAdapter } from "@src/databases/mongodb/mongo-db-adapter";

describe("Multi-Adapter Transaction & Lifecycle Parity", () => {
  describe("MariaDB TransactionModule", () => {
    it("fails fast with notConnectedError when disconnected without calling throwing db getter", async () => {
      const mockCore: any = {
        isConnected: vi.fn().mockReturnValue(false),
        pool: null,
        notConnectedError: vi.fn().mockReturnValue({
          success: false,
          message: "Database not connected",
          error: { code: "NOT_CONNECTED", message: "Database not connected" },
        }),
        get db() {
          throw new Error("Throwing db getter should not be called when disconnected");
        },
      };

      const txModule = new MariaTransactionModule(mockCore);
      const res = await txModule.execute(async () => ({ success: true, data: undefined }));

      expect(res.success).toBe(false);
      expect(mockCore.notConnectedError).toHaveBeenCalled();
    });

    it("prevents operations after explicit commit and auto-injects transaction into domain modules", async () => {
      const capturedOpts: any[] = [];
      const mockCore: any = {
        isConnected: vi.fn().mockReturnValue(true),
        pool: {},
        db: {
          transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
            const fakeTx = {
              session: { client: { query: vi.fn() } },
            };
            return cb(fakeTx);
          }),
        },
        crud: {
          insert: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        findById: vi.fn().mockResolvedValue({ success: true, data: { _id: "row-1" } }),
        content: {
          createNode: (_node: any, opts: any) => {
            capturedOpts.push(opts);
            return Promise.resolve({ success: true });
          },
        },
        auth: {},
        media: {},
        system: {},
        batch: {},
        collection: {},
        handleError: vi.fn((err: any) => ({ success: false, error: err })),
      };

      const txModule = new MariaTransactionModule(mockCore);

      // Verify domain injection & findById routing
      const runRes = await txModule.execute(async (tx: any) => {
        // Domain call automatically receives transaction
        await tx.content.createNode({ title: "Test" });

        // findById routes to core.findById
        const found = await tx.findById("posts", "row-1");
        expect(found.success).toBe(true);

        await tx.commit();

        // Operation after commit must throw
        await expect(tx.insert("posts", { title: "After commit" })).rejects.toThrow(
          /TRANSACTION_ALREADY_COMMITTED/,
        );

        return { success: true, data: "ok" };
      });

      expect(runRes.success).toBe(true);
      expect(mockCore.findById).toHaveBeenCalledWith(
        "posts",
        "row-1",
        expect.objectContaining({ transaction: expect.any(Object) }),
      );
      expect(capturedOpts.length).toBe(1);
      expect(capturedOpts[0]).toMatchObject({ transaction: expect.any(Object) });
    });

    it("returns TRANSACTION_ROLLED_BACK envelope on explicit rollback()", async () => {
      const mockCore: any = {
        isConnected: vi.fn().mockReturnValue(true),
        pool: {},
        db: {
          transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
            const fakeTx = { session: { client: {} } };
            return cb(fakeTx);
          }),
        },
        crud: { insert: vi.fn() },
        handleError: vi.fn((err: any) => ({ success: false, error: err })),
      };

      const txModule = new MariaTransactionModule(mockCore);
      const res = await txModule.execute(async (tx) => {
        await tx.rollback();
        return { success: true, data: undefined };
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error?.code).toBe("TRANSACTION_ROLLED_BACK");
      }
    });
  });

  describe("SQLite TransactionModule", () => {
    it("fails fast with notConnectedError when disconnected", async () => {
      const mockCore: any = {
        isConnected: vi.fn().mockReturnValue(false),
        sqlite: null,
        notConnectedError: vi.fn().mockReturnValue({
          success: false,
          message: "Database not connected",
          error: { code: "NOT_CONNECTED", message: "Database not connected" },
        }),
      };

      const txModule = new SqliteTransactionModule(mockCore);
      const res = await txModule.execute(async () => ({ success: true, data: undefined }));

      expect(res.success).toBe(false);
      expect(mockCore.notConnectedError).toHaveBeenCalled();
    });

    it("enforces commit lifecycle and proxies domain modules with transaction options", async () => {
      const capturedOpts: any[] = [];
      const mockCore: any = {
        isConnected: vi.fn().mockReturnValue(true),
        sqlite: {
          exec: vi.fn(),
        },
        db: {},
        crud: {
          insert: vi.fn(),
          insertMany: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        findById: vi.fn().mockResolvedValue({ success: true, data: { _id: "sq-1" } }),
        content: {
          createNode: (_node: any, opts: any) => {
            capturedOpts.push(opts);
            return Promise.resolve({ success: true });
          },
        },
        auth: {},
        media: {},
        system: {},
        batch: {},
        collection: {},
        handleError: vi.fn((err: any) => ({ success: false, error: err })),
      };

      const txModule = new SqliteTransactionModule(mockCore);

      const runRes = await txModule.execute(async (tx: any) => {
        await tx.content.createNode({ title: "SQLite node" });

        const found = await tx.findById("posts", "sq-1");
        expect(found.success).toBe(true);

        await tx.commit();

        await expect(tx.insert("posts", { title: "After commit" })).rejects.toThrow(
          /TRANSACTION_ALREADY_COMMITTED/,
        );

        return { success: true, data: "ok" };
      });

      expect(runRes.success).toBe(true);
      expect(mockCore.findById).toHaveBeenCalledWith(
        "posts",
        "sq-1",
        expect.objectContaining({ transaction: expect.any(Object) }),
      );
      expect(capturedOpts.length).toBe(1);
      expect(capturedOpts[0]).toMatchObject({ transaction: expect.any(Object) });
    });
  });

  describe("MongoDB TransactionModule", () => {
    it("fails fast when not connected", async () => {
      const mockAdapter: any = {
        isConnected: vi.fn().mockReturnValue(false),
        connection: null,
      };

      const txModule = new MongoTransactionModule(mockAdapter);
      const res = await txModule.execute(async () => ({ success: true, data: undefined }));

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error?.code).toBe("NOT_CONNECTED");
      }
    });

    it("auto-injects session into domain calls and prevents operations after commit", async () => {
      const capturedOpts: any[] = [];
      const fakeSession: any = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
        inTransaction: vi.fn().mockReturnValue(true),
      };

      const mockAdapter: any = {
        isConnected: vi.fn().mockReturnValue(true),
        connection: {
          startSession: vi.fn().mockResolvedValue(fakeSession),
        },
        crud: {
          insert: vi.fn(),
          insertMany: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          findById: vi.fn().mockResolvedValue({ success: true, data: { _id: "m-1" } }),
        },
        content: {
          createNode: (_node: any, opts: any) => {
            capturedOpts.push(opts);
            return Promise.resolve({ success: true });
          },
        },
        auth: {},
        media: {},
        system: {},
        batch: {},
        collection: {},
      };

      const txModule = new MongoTransactionModule(mockAdapter);

      const runRes = await txModule.execute(async (tx: any) => {
        await tx.content.createNode({ title: "Mongo node" });

        const found = await tx.findById("posts", "m-1");
        expect(found.success).toBe(true);

        await tx.commit();

        await expect(tx.insert("posts", { title: "After commit" })).rejects.toThrow(
          /TRANSACTION_ALREADY_COMMITTED/,
        );

        return { success: true, data: "ok" };
      });

      expect(runRes.success).toBe(true);
      expect(fakeSession.commitTransaction).toHaveBeenCalled();
      expect(capturedOpts.length).toBe(1);
      expect(capturedOpts[0]).toMatchObject({ session: fakeSession });
    });
  });

  describe("getVersion Caching Parity across Adapters", () => {
    it("caches MariaDB version after initial query and clears on disconnect", async () => {
      let queryCount = 0;
      const adapter = new MariaDBAdapter();
      (adapter as any).pool = {
        query: vi.fn().mockImplementation(async () => {
          queryCount++;
          return [[{ version: "11.4.3-MariaDB" }]];
        }),
        end: vi.fn().mockResolvedValue(undefined),
      };
      (adapter as any).connected = true;

      const v1 = await adapter.getVersion();
      expect(v1.success).toBe(true);
      if (v1.success) expect(v1.data).toBe("11.4.3-MariaDB");
      expect(queryCount).toBe(1);

      const v2 = await adapter.getVersion();
      expect(v2.success).toBe(true);
      if (v2.success) expect(v2.data).toBe("11.4.3-MariaDB");
      expect(queryCount).toBe(1); // Cached!

      (adapter as any).tableRegistry = { clear: vi.fn() };
      (adapter as any).dynamicTables = { clear: vi.fn() };
      await adapter.disconnect();

      // Reconnect mock pool and flag
      (adapter as any).pool = {
        query: vi.fn().mockImplementation(async () => {
          queryCount++;
          return [[{ version: "11.4.3-MariaDB" }]];
        }),
        end: vi.fn().mockResolvedValue(undefined),
      };
      (adapter as any).connected = true;

      // After disconnect, next getVersion queries again
      const v3 = await adapter.getVersion();
      expect(v3.success).toBe(true);
      expect(queryCount).toBe(2);
    });

    it("caches SQLite version after initial query and clears on disconnect", async () => {
      let queryCount = 0;
      const adapter = new SQLiteAdapter();
      (adapter as any).prepareAndExecute = vi.fn().mockImplementation(() => {
        queryCount++;
        return { version: "3.46.1" };
      });
      (adapter as any).connected = true;

      const v1 = await adapter.getVersion();
      expect(v1.success).toBe(true);
      if (v1.success) expect(v1.data).toBe("3.46.1");
      expect(queryCount).toBe(1);

      const v2 = await adapter.getVersion();
      expect(v2.success).toBe(true);
      if (v2.success) expect(v2.data).toBe("3.46.1");
      expect(queryCount).toBe(1); // Cached!

      await adapter.disconnect();

      // Re-arm connected state after disconnect
      (adapter as any).connected = true;

      const v3 = await adapter.getVersion();
      expect(v3.success).toBe(true);
      expect(queryCount).toBe(2);
    });

    it("caches MongoDB version after initial serverStatus and clears on disconnect", async () => {
      let queryCount = 0;
      const adapter = new MongoDBAdapter();
      (adapter as any).connected = true;
      (adapter as any)._connection = {
        readyState: 1,
        db: {
          admin: () => ({
            serverStatus: async () => {
              queryCount++;
              return { version: "7.0.12" };
            },
          }),
        },
        close: vi.fn().mockResolvedValue(undefined),
      };

      const v1 = await adapter.getVersion();
      expect(v1.success).toBe(true);
      if (v1.success) expect(v1.data).toBe("7.0.12");
      expect(queryCount).toBe(1);

      const v2 = await adapter.getVersion();
      expect(v2.success).toBe(true);
      if (v2.success) expect(v2.data).toBe("7.0.12");
      expect(queryCount).toBe(1); // Cached!

      await adapter.disconnect();

      // Re-arm connection
      (adapter as any).connected = true;
      (adapter as any)._connection = {
        readyState: 1,
        db: {
          admin: () => ({
            serverStatus: async () => {
              queryCount++;
              return { version: "7.0.12" };
            },
          }),
        },
      };

      const v3 = await adapter.getVersion();
      expect(v3.success).toBe(true);
      expect(queryCount).toBe(2);
    });
  });
});
