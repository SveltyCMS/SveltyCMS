/**
 * @file tests/unit/databases/modern-db-engine.test.ts
 * @description
 * Unit tests for the 2027 State-of-the-Art database engine upgrades:
 * - Phase 1: Prepared statement warmup engine
 * - Phase 2: Adaptive write coalescer
 * - Phase 3: Compiled wire-plane descriptor
 * - Phase 4: Canonical QueryIR and capability matrix
 */

import { describe, it, expect } from "vitest";
import { AdaptiveWriteCoalescer } from "@src/databases/core/write-coalescer";
import {
  compileWireProjection,
  createContentNodeWireDescriptor,
} from "@src/databases/core/wire-descriptor";
import {
  compileQueryIRToSql,
  compileQueryIRToMongo,
  createPointReadIR,
  type QueryIR,
} from "@src/databases/core/query-ir";

describe("2027 State-of-the-Art DB Engine Upgrades (Phases 2-4)", () => {
  // ==========================================================================
  // Phase 2: Adaptive Write Coalescer
  // ==========================================================================
  describe("Phase 2: Adaptive Write Coalescer", () => {
    it("executes single writes immediately on the microtask tick without artificial delays", async () => {
      const coalescer = new AdaptiveWriteCoalescer();
      let executed = false;

      const res = await coalescer.submit(async () => {
        executed = true;
        return "single-result";
      });

      expect(executed).toBe(true);
      expect(res).toBe("single-result");
      const metrics = coalescer.getMetrics();
      expect(metrics.totalSingleWrites).toBe(1);
      expect(metrics.totalBatches).toBe(1);
      expect(metrics.totalCoalescedWrites).toBe(0);
    });

    it("coalesces concurrent write submissions into a micro-batch", async () => {
      const coalescer = new AdaptiveWriteCoalescer();

      const promises = [
        coalescer.submit(() => "val-1"),
        coalescer.submit(() => "val-2"),
        coalescer.submit(() => "val-3"),
        coalescer.submit(() => "val-4"),
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual(["val-1", "val-2", "val-3", "val-4"]);

      const metrics = coalescer.getMetrics();
      expect(metrics.totalBatches).toBe(1);
      expect(metrics.totalCoalescedWrites).toBe(4);
      expect(metrics.maxBatchSizeSeen).toBe(4);
    });

    it("isolates operation failures so one failed op does not reject sibling ops", async () => {
      const coalescer = new AdaptiveWriteCoalescer();

      const p1 = coalescer.submit(() => "success-1");
      const p2 = coalescer.submit(() => {
        throw new Error("unique constraint violation");
      });
      const p3 = coalescer.submit(() => "success-3");

      const [r1, r2, r3] = await Promise.allSettled([p1, p2, p3]);

      expect(r1.status).toBe("fulfilled");
      if (r1.status === "fulfilled") expect(r1.value).toBe("success-1");

      expect(r2.status).toBe("rejected");
      if (r2.status === "rejected")
        expect((r2.reason as Error).message).toBe("unique constraint violation");

      expect(r3.status).toBe("fulfilled");
      if (r3.status === "fulfilled") expect(r3.value).toBe("success-3");
    });
  });

  // ==========================================================================
  // Phase 3: Compiled Wire-Plane Descriptor
  // ==========================================================================
  describe("Phase 3: Compiled Wire-Plane Descriptor", () => {
    it("compiles PostgreSQL wire projection to jsonb_build_object", () => {
      const desc = createContentNodeWireDescriptor("content_nodes");
      const sql = compileWireProjection(desc, "postgresql") as string;

      expect(sql).toContain("jsonb_build_object(");
      expect(sql).toContain("'_id', \"_id\"");
      expect(sql).toContain("'tenantId', \"tenantId\"");
      expect(sql).toContain("'data', \"data\"");
      expect(sql).toContain("to_char(\"createdAt\" AT TIME ZONE 'UTC'");
    });

    it("compiles SQLite wire projection to json_object", () => {
      const desc = createContentNodeWireDescriptor("content_nodes");
      const sql = compileWireProjection(desc, "sqlite") as string;

      expect(sql).toContain("json_object(");
      expect(sql).toContain("'_id', \"_id\"");
      expect(sql).toContain("'data', json(\"data\")");
    });

    it("compiles MariaDB wire projection to JSON_OBJECT", () => {
      const desc = createContentNodeWireDescriptor("content_nodes");
      const sql = compileWireProjection(desc, "mariadb") as string;

      expect(sql).toContain("JSON_OBJECT(");
      expect(sql).toContain("`_id`");
      expect(sql).toContain("JSON_EXTRACT(`data`, '$')");
    });

    it("compiles MongoDB wire projection to $project pipeline stage", () => {
      const desc = createContentNodeWireDescriptor("content_nodes");
      const projection = compileWireProjection(desc, "mongodb") as Record<string, string>;

      expect(projection._id).toBe("$_id");
      expect(projection.tenantId).toBe("$tenantId");
      expect(projection.data).toBe("$data");
    });
  });

  // ==========================================================================
  // Phase 4: Canonical QueryIR and Compiler
  // ==========================================================================
  describe("Phase 4: Canonical QueryIR & Dialect Compiler", () => {
    it("compiles point read QueryIR to parameterized SQL across dialects", () => {
      const ir = createPointReadIR("content_nodes", "doc-123", "tenant-abc");

      const pg = compileQueryIRToSql(ir, "postgresql");
      expect(pg.sql).toBe(
        'SELECT * FROM "content_nodes" WHERE "tenantId" = $1 AND "_id" = $2 LIMIT $3',
      );
      expect(pg.params).toEqual(["tenant-abc", "doc-123", 1]);

      const sqlite = compileQueryIRToSql(ir, "sqlite");
      expect(sqlite.sql).toBe(
        'SELECT * FROM "content_nodes" WHERE "tenantId" = ? AND "_id" = ? LIMIT ?',
      );
      expect(sqlite.params).toEqual(["tenant-abc", "doc-123", 1]);

      const maria = compileQueryIRToSql(ir, "mariadb");
      expect(maria.sql).toBe(
        "SELECT * FROM `content_nodes` WHERE `tenantId` = ? AND `_id` = ? LIMIT ?",
      );
      expect(maria.params).toEqual(["tenant-abc", "doc-123", 1]);
    });

    it("compiles complex logical AND/OR queries to SQL", () => {
      const complexIR: QueryIR = {
        collection: "articles",
        tenantId: "tenant-1",
        filter: {
          type: "and",
          children: [
            { type: "comparison", field: "status", operator: "eq", value: "published" },
            {
              type: "or",
              children: [
                { type: "comparison", field: "views", operator: "gte", value: 100 },
                { type: "comparison", field: "featured", operator: "eq", value: true },
              ],
            },
          ],
        },
        sort: [{ field: "createdAt", direction: "desc" }],
        limit: 20,
        offset: 0,
      };

      const pg = compileQueryIRToSql(complexIR, "postgresql");
      expect(pg.sql).toContain('"status" = $2');
      expect(pg.sql).toContain('"views" >= $3 OR "featured" = $4');
      expect(pg.sql).toContain('ORDER BY "createdAt" DESC');
      expect(pg.sql).toContain("LIMIT $5 OFFSET $6");
      expect(pg.params).toEqual(["tenant-1", "published", 100, true, 20, 0]);
    });

    it("compiles QueryIR to MongoDB query and projection with 100% semantic parity", () => {
      const complexIR: QueryIR = {
        collection: "articles",
        tenantId: "tenant-1",
        filter: {
          type: "and",
          children: [
            { type: "comparison", field: "status", operator: "eq", value: "published" },
            {
              type: "or",
              children: [
                { type: "comparison", field: "views", operator: "gte", value: 100 },
                { type: "comparison", field: "featured", operator: "eq", value: true },
              ],
            },
          ],
        },
        sort: [{ field: "createdAt", direction: "desc" }],
        limit: 10,
        fields: ["title", "slug"],
      };

      const mongo = compileQueryIRToMongo(complexIR);
      expect(mongo.filter.tenantId).toBe("tenant-1");
      expect(mongo.filter.$and).toBeDefined();
      expect(mongo.sort).toEqual({ createdAt: -1 });
      expect(mongo.limit).toBe(10);
      expect(mongo.projection).toEqual({ title: 1, slug: 1 });
    });
  });
});
