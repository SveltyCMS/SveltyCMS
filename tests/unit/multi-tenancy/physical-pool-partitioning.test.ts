/**
 * @file tests/unit/multi-tenancy/physical-pool-partitioning.test.ts
 * @description Unit tests for driver-level physical multi-tenant connection pool partitioning (Phase 4).
 *
 * Verifies that PostgreSQL and MariaDB adapters correctly allocate dedicated connection pool
 * slices per tenant, route queries according to tenant context, and cleanly isolate connection
 * pools without crosstalk or resource leaks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Physical Multi-Tenant Connection Pool Partitioning (Phase 4)", () => {
  describe("PostgreSQL Tenant Pool Partitioning", () => {
    let mockEnd: any;
    let mockPostgresClient: any;
    let adapter: any;

    beforeEach(async () => {
      mockEnd = vi.fn().mockResolvedValue(undefined);
      mockPostgresClient = Object.assign(vi.fn().mockResolvedValue([{ version: "18.4" }]), {
        end: mockEnd,
        unsafe: vi.fn().mockResolvedValue([]),
      });

      const { PostgreSQLAdapter } = await import("@src/databases/postgresql/postgres-adapter");
      adapter = new PostgreSQLAdapter();
      (adapter as any).sql = mockPostgresClient;
      process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
    });

    afterEach(async () => {
      if (adapter) {
        await adapter.closeAllTenantPools();
      }
    });

    it("should manage dedicated tenant pool lifecycle (get, register, close)", async () => {
      const tenantA = "tenant_alpha";
      const tenantB = "tenant_beta";

      // 1. Get/create dedicated pool for tenantA
      const poolA = adapter.getTenantPool(tenantA);
      expect(poolA).toBeDefined();

      // Second get should return cached pool
      const poolA2 = adapter.getTenantPool(tenantA);
      expect(poolA2).toBe(poolA);

      // 2. Custom connection URL for tenantB
      adapter.setTenantPool(tenantB, "postgres://user:pass@tenant-b-host:5432/tenant_b_db");
      const poolB = adapter.getTenantPool(tenantB);
      expect(poolB).toBeDefined();
      expect(poolB).not.toBe(poolA);

      // 3. Set and get tenant context with mock executor
      const mockTenantSql = Object.assign(vi.fn().mockResolvedValue([]), {
        end: vi.fn().mockResolvedValue(undefined),
      });
      (adapter as any)._tenantPools.set(tenantA, mockTenantSql);
      await adapter.setTenantContext(tenantA);
      expect(adapter.currentTenantId).toBe(tenantA);
      expect(mockTenantSql).toHaveBeenCalled();

      // 4. Close tenantA pool
      await adapter.closeTenantPool(tenantA);
      expect((adapter as any)._tenantPools.has(tenantA)).toBe(false);
      expect((adapter as any)._tenantPools.has(tenantB)).toBe(true);

      // 5. Close all tenant pools
      await adapter.closeAllTenantPools();
      expect((adapter as any)._tenantPools.size).toBe(0);
      expect(adapter.currentTenantId).toBeNull();
    });
  });

  describe("MariaDB Tenant Pool Partitioning", () => {
    let adapter: any;
    let mockPool: any;

    beforeEach(async () => {
      mockPool = {
        query: vi.fn().mockResolvedValue([[{ 1: 1 }]]),
        execute: vi.fn().mockResolvedValue([[], []]),
        end: vi.fn().mockResolvedValue(undefined),
      };

      const { MariaDBAdapter } = await import("@src/databases/mariadb/mariadb-adapter");
      adapter = new MariaDBAdapter();
      adapter.pool = mockPool;
      (adapter as any)._rawPoolConfig = {
        host: "127.0.0.1",
        user: "root",
        database: "testdb",
      };
      adapter.connected = true;
    });

    afterEach(async () => {
      if (adapter) {
        await adapter.closeAllTenantPools();
      }
    });

    it("should create, cache, and route to dedicated tenant pools", async () => {
      const tenantId = "tenant_finance";

      // 1. Get/create dedicated pool
      const tenantPool = adapter.getTenantPool(tenantId);
      expect(tenantPool).toBeDefined();

      // Cache hit
      const cached = adapter.getTenantPool(tenantId);
      expect(cached).toBe(tenantPool);

      // 2. Set tenant context and verify currentTenantId
      adapter.setTenantContext(tenantId);
      expect(adapter.currentTenantId).toBe(tenantId);

      // 3. Verify raw execution routes to tenant pool
      const mockTenantExecute = vi.fn().mockResolvedValue([[{ id: "rec-1" }]]);
      tenantPool.execute = mockTenantExecute;

      const raw = adapter.raw;
      const res = await raw.execute("SELECT * FROM documents WHERE id = ?", ["rec-1"]);
      expect(mockTenantExecute).toHaveBeenCalledWith("SELECT * FROM documents WHERE id = ?", [
        "rec-1",
      ]);
      expect(res).toEqual([{ id: "rec-1" }]);

      // 4. Close tenant pool
      await adapter.closeTenantPool(tenantId);
      expect((adapter as any)._tenantPools.has(tenantId)).toBe(false);

      // 5. Reset tenant context
      adapter.setTenantContext(null);
      expect(adapter.currentTenantId).toBeNull();
    });

    it("should close all dedicated pools on disconnect", async () => {
      adapter.getTenantPool("tenant_1");
      adapter.getTenantPool("tenant_2");
      expect((adapter as any)._tenantPools.size).toBe(2);

      await adapter.disconnect();
      expect((adapter as any)._tenantPools.size).toBe(0);
      expect(adapter.currentTenantId).toBeNull();
      expect(adapter.connected).toBe(false);
    });
  });
});
