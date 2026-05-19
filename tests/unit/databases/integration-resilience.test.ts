/**
 * @file tests/unit/databases/integration-resilience.test.ts
 * @description
 * Integration test suite for database resilience, configuration validation, and schema drift handling.
 *
 * Responsibilities include:
 * - Verifying fast-failure and state validation under corrupted env (Pillar 1).
 * - Testing schema drift mapping using a sterile in-memory SQLite adapter (Pillar 2).
 * - Proving dynamic document fields serialize/deserialize perfectly when missing physically.
 */

import { describe, it, expect, vi } from "vitest";
vi.unmock("@src/databases/db");
import { ensureFullInitialization, resetDbInitPromise } from "@src/databases/db";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import { generateUUID } from "@src/utils/native-utils";

describe("SveltyCMS Integration Resilience & Boundary Audits", () => {
  describe("Pillar 1: System State & Config Validation", () => {
    it("should reject corrupted configurations with a controlled MISSING_CONFIG error", async () => {
      // 1. Simulate corrupted configuration flag
      process.env.CORRUPT_CONFIG = "true";
      const originalBooted = (globalThis as any).__SVELTY_CMS_BOOTED__;
      (globalThis as any).__SVELTY_CMS_BOOTED__ = false;
      resetDbInitPromise();

      try {
        // 2. Expect database boot to fail fast and predictably
        await ensureFullInitialization();
        expect.unreachable("Boot sequence should have failed for corrupted configuration.");
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        // Unwrap AppError code if present, or fallback to error message check
        const errorCode = (err as any).code || (err as any).body?.code;
        expect(errorCode).toBe("MISSING_CONFIG");
        expect(err.message).toContain("corrupted or missing");
      } finally {
        // 3. Revert state and clear environment
        delete process.env.CORRUPT_CONFIG;
        (globalThis as any).__SVELTY_CMS_BOOTED__ = originalBooted;
        resetDbInitPromise();
      }
    });
  });

  describe("Pillar 2: Boundary Validation & Schema Drift Resilience", () => {
    it("should handle payload fields missing from physical table structures via dynamic JSON serialization", async () => {
      // 1. Initialize SQLite adapter connected to sterile in-memory connection
      const adapter = new SQLiteAdapter();
      const connResult = await adapter.connect(":memory:");
      expect(connResult.success).toBe(true);

      // 2. Provision physical table with minimal core columns (no 'customField' column)
      const tableName = "collection_drift_test";
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          "_id" TEXT PRIMARY KEY,
          "tenantId" TEXT,
          "data" TEXT NOT NULL DEFAULT '{}',
          "status" TEXT NOT NULL DEFAULT 'draft',
          "isDeleted" INTEGER NOT NULL DEFAULT 0,
          "createdAt" INTEGER NOT NULL,
          "updatedAt" INTEGER NOT NULL
        );
      `;
      await adapter.raw.execute(createTableSql);

      // 3. Payload containing dynamic fields not physically present in table
      const docId = generateUUID();
      const payload = {
        _id: docId,
        title: "Resilient Entry",
        customField: "This field does not physically exist in the database table schema.",
        rating: 9.5,
        isDeleted: false,
      };

      // 4. Perform insert operation
      const insertResult = (await adapter.crud.insert(tableName, payload)) as any;
      expect(insertResult.success).toBe(true);
      expect(insertResult.data).toBeDefined();

      // 5. Query the entry back from the adapter
      const findResult = (await adapter.crud.findOne<any>(tableName, { _id: docId })) as any;
      expect(findResult.success).toBe(true);
      expect(findResult.data).toBeDefined();

      const retrieved = findResult.data;

      // 6. Verify perfect reconstruction of the entry including schema-drift fields
      expect(retrieved._id).toBe(docId);
      expect(retrieved.title).toBe("Resilient Entry");
      expect(retrieved.customField).toBe(
        "This field does not physically exist in the database table schema.",
      );
      expect(retrieved.rating).toBe(9.5);
      expect(retrieved.isDeleted).toBe(false);

      // 7. Cleanup and disconnect
      await adapter.disconnect();
    });
  });

  describe("Pillar 3: Distributed Tracing & High-Resolution Observability", () => {
    it("should accumulate spans inside runWithTrace and short-circuit when disabled", async () => {
      const { runWithTrace, traceSpan, traceSpanSync, getTrace } =
        await import("@src/utils/context");

      // 1. Tracing disabled - should not record any spans (zero overhead)
      const resDisabled = await runWithTrace("test-trace-disabled", false, async () => {
        const val1 = traceSpanSync("sync-task", () => 42);
        const val2 = await traceSpan("async-task", async () => {
          await new Promise((r) => setTimeout(r, 5));
          return 100;
        });
        const trace = getTrace();
        expect(trace).toBeDefined();
        expect(trace?.spans.length).toBe(0);
        return val1 + val2;
      });
      expect(resDisabled).toBe(142);

      // 2. Tracing enabled - should capture high-resolution spans and execution time
      const resEnabled = await runWithTrace("test-trace-enabled", true, async () => {
        const val1 = traceSpanSync("sync-task-2", () => 200);
        const val2 = await traceSpan("async-task-2", async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 300;
        });
        const trace = getTrace();
        expect(trace).toBeDefined();
        expect(trace?.spans.length).toBe(2);
        expect(trace?.spans[0].name).toBe("sync-task-2");
        expect(trace?.spans[0].duration).toBeLessThan(10);
        expect(trace?.spans[1].name).toBe("async-task-2");
        expect(trace?.spans[1].duration).toBeGreaterThanOrEqual(9);
        return val1 + val2;
      });
      expect(resEnabled).toBe(500);
    });
  });
});
