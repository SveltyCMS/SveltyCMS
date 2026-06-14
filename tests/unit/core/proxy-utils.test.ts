/**
 * @file tests/unit/core/proxy-utils.test.ts
 * @description White-box unit tests for the extracted Proxy factories in databases/core.
 * Validates HMR/self-healing recovery, exact tenant injection semantics (no leakage),
 * hot-swap zero-tax behavior for LocalCMS, function binding cache, edge cases, and
 * security-relevant properties (tenant defaults, special prop handling).
 *
 * These tests protect the "magic" that delivers ergonomic DX + sub-millisecond
 * LocalCMS paths + cross-HMR resilience without regressing tenant isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSelfHealingProxy,
  createTenantInjectingProxy,
  defineLazyNamespace,
} from "@src/databases/core/proxy-utils";
import type { DatabaseId } from "@src/databases/db-interface";

describe("proxy-utils (core database + SDK proxies)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. createSelfHealingProxy (extracted from db.ts root adapter proxy)
  // ============================================================================
  describe("createSelfHealingProxy", () => {
    it("returns the live instance and binds functions (happy path)", async () => {
      const mockInstance = {
        isConnected: () => true,
        crud: {
          findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
        },
      };
      const getInstance = vi.fn(() => mockInstance);
      const reinitialize = vi.fn().mockResolvedValue(undefined);

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      // Direct property access
      expect((proxy as any).isConnected()).toBe(true);
      expect(getInstance).toHaveBeenCalled();

      // Function access on root
      const res = (proxy as any).crud.findMany("collection_posts", {});
      await expect(res).resolves.toEqual({ success: true, data: [] });
    });

    it("creates recursive sub-proxies for declared namespaceKeys (crud, auth, etc.)", async () => {
      const mockCrud = {
        findOne: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
      };
      const mockInstance: any = {
        isConnected: () => true,
        crud: mockCrud,
        auth: { validateSession: vi.fn() },
      };
      const getInstance = vi.fn(() => mockInstance);
      const reinitialize = vi.fn();

      const proxy = createSelfHealingProxy(getInstance, reinitialize, ["crud", "auth"]);

      const crudProxy = (proxy as any).crud;
      expect(crudProxy).not.toBe(mockCrud); // it's a proxy wrapper
      await (crudProxy as any).findOne({});
      expect(mockCrud.findOne).toHaveBeenCalled();
    });

    it("auto-heals on null instance by calling reinitialize (HMR / connection loss recovery)", async () => {
      let current: any = null;
      const getInstance = vi.fn(() => current);
      const reinitialize = vi.fn().mockImplementation(async () => {
        current = {
          isConnected: () => true,
          crud: { count: vi.fn().mockResolvedValue({ success: true, data: 42 }) },
        };
      });

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      // First access: null -> triggers recovery
      const result = await (proxy as any).crud.count("x", {});
      expect(reinitialize).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, data: 42 });
    });

    it("yields recovery wrapper for isConnected; after failed heal attempt the special case returns false (last-resort guard)", async () => {
      let current: any = null;
      const getInstance = vi.fn(() => current);
      const reinitialize = vi.fn().mockImplementation(async () => {
        // Simulate heal that does NOT restore a usable instance (e.g. persistent HMR/boot failure)
        current = null;
      });

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      const isConnectedMethod = (proxy as any).isConnected;
      expect(typeof isConnectedMethod).toBe("function");

      const result = await isConnectedMethod(); // wrapper runs, heal attempted, still !inst → special false
      expect(result).toBe(false);
      expect(reinitialize).toHaveBeenCalledTimes(1);

      // Other methods also surface clear error after failed heal (already covered by sibling test)
    });

    it("live healthy instance reports isConnected synchronously via bound method", () => {
      const mockInstance = {
        isConnected: vi.fn(() => true),
        crud: {},
      };
      const getInstance = vi.fn(() => mockInstance);
      const reinitialize = vi.fn();

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      // When instance present: .isConnected is the bound real method (sync boolean)
      const isConn = (proxy as any).isConnected;
      expect(typeof isConn).toBe("function");
      expect(isConn()).toBe(true);
      expect(mockInstance.isConnected).toHaveBeenCalled();
    });

    it("throws clear CRITICAL error when recovery fails and method is not isConnected", async () => {
      const getInstance = vi.fn(() => null);
      const reinitialize = vi.fn().mockRejectedValue(new Error("boot failed"));

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      await expect((proxy as any).crud.findMany("foo", {})).rejects.toThrow(
        /CRITICAL: Database access attempt on 'crud.findMany'/,
      );
      expect(reinitialize).toHaveBeenCalled();
    });

    it("caches bound functions per target (avoids repeated .bind)", () => {
      const findMany = vi.fn();
      const mockInstance = {
        isConnected: () => true,
        crud: { findMany },
      };
      const getInstance = vi.fn(() => mockInstance);
      const reinitialize = vi.fn();

      const proxy = createSelfHealingProxy(getInstance, reinitialize);

      const fn1 = (proxy as any).crud.findMany;
      const fn2 = (proxy as any).crud.findMany;
      expect(fn1).toBe(fn2); // same bound reference from cache
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 2. createTenantInjectingProxy (extracted from tenant-adapter.ts forTenant)
  // ============================================================================
  describe("createTenantInjectingProxy", () => {
    const defaultTenant = "tenant-ABC" as DatabaseId;

    function makeInject(defaultT: DatabaseId) {
      return (opts?: Record<string, any>) => ({
        ...opts,
        tenantId: opts?.tenantId ?? defaultT,
      });
    }

    it("injects tenantId when last arg is missing or not an object", () => {
      const ns = {
        delete: vi.fn().mockResolvedValue({ success: true }),
      };
      const proxied = createTenantInjectingProxy(ns, makeInject(defaultTenant));

      // Call with single id (no options)
      (proxied as any).delete("doc-1");

      expect(ns.delete).toHaveBeenCalledWith("doc-1", { tenantId: defaultTenant });
    });

    it("merges into existing options object (preserves other fields)", () => {
      const ns = { findMany: vi.fn() };
      const proxied = createTenantInjectingProxy(ns, makeInject(defaultTenant));

      (proxied as any).findMany("coll", { filter: { status: "published" }, limit: 10 });

      expect(ns.findMany).toHaveBeenCalledWith(
        "coll",
        expect.objectContaining({
          filter: { status: "published" },
          limit: 10,
          tenantId: defaultTenant,
        }),
      );
    });

    it("respects explicitly passed tenantId (caller override wins via ??)", () => {
      const ns = { findOne: vi.fn() };
      const proxied = createTenantInjectingProxy(ns, makeInject(defaultTenant));

      (proxied as any).findOne("coll", { tenantId: "other-tenant" as DatabaseId });

      expect(ns.findOne).toHaveBeenCalledWith(
        "coll",
        expect.objectContaining({ tenantId: "other-tenant" }),
      );
    });

    it("does not leak tenant across independently created proxies (no cross-tenant pollution)", () => {
      const ns1 = { update: vi.fn() };
      const ns2 = { update: vi.fn() };

      const proxy1 = createTenantInjectingProxy(ns1, makeInject("tenant-1" as DatabaseId));
      const proxy2 = createTenantInjectingProxy(ns2, makeInject("tenant-2" as DatabaseId));

      (proxy1 as any).update("id", { data: "x" });
      (proxy2 as any).update("id", { data: "y" });

      expect(ns1.update).toHaveBeenCalledWith(
        "id",
        expect.objectContaining({ tenantId: "tenant-1" }),
      );
      expect(ns2.update).toHaveBeenCalledWith(
        "id",
        expect.objectContaining({ tenantId: "tenant-2" }),
      );
    });

    it("appends fresh options object when last arg is a primitive or array", () => {
      const ns = { bulk: vi.fn() };
      const proxied = createTenantInjectingProxy(ns, makeInject(defaultTenant));

      (proxied as any).bulk([1, 2, 3]); // array last arg

      const lastCall = ns.bulk.mock.calls[0];
      expect(lastCall[0]).toEqual([1, 2, 3]);
      expect(lastCall[1]).toEqual({ tenantId: defaultTenant });
    });
  });

  // ============================================================================
  // 3. defineLazyNamespace (extracted from services/sdk/index.ts LocalCMS hot-swap)
  // ============================================================================
  describe("defineLazyNamespace", () => {
    it("lazily initializes on first access and hot-swaps the property to direct value (zero tax after)", async () => {
      const target: any = {};
      const fakeNamespace = {
        find: vi.fn().mockResolvedValue({ data: "found" }),
        list: vi.fn(),
      };
      const factory = vi.fn().mockResolvedValue(fakeNamespace);

      defineLazyNamespace(target, "collections", factory);

      // Before access: getter exists
      const descBefore = Object.getOwnPropertyDescriptor(target, "collections");
      expect(typeof descBefore?.get).toBe("function");

      // First access triggers factory + hot-swap
      const result = await target.collections.find({});

      expect(factory).toHaveBeenCalledTimes(1);
      expect(fakeNamespace.find).toHaveBeenCalled();
      expect(result).toEqual({ data: "found" });

      // After: direct value, no getter
      const descAfter = Object.getOwnPropertyDescriptor(target, "collections");
      expect(descAfter?.value).toBe(fakeNamespace);
      expect(descAfter?.get).toBeUndefined();

      // Subsequent access is direct (no factory again)
      await target.collections.list();
      expect(factory).toHaveBeenCalledTimes(1);
      expect(fakeNamespace.list).toHaveBeenCalled();
    });

    it("supports nestedNamespaces forwarding (e.g. cms.system.settings)", async () => {
      const target: any = {};
      const systemNs = {
        settings: {
          get: vi.fn().mockResolvedValue("value-42"),
        },
      };
      const factory = vi.fn().mockResolvedValue(systemNs);

      defineLazyNamespace(target, "system", factory, { settings: true });

      const val = await target.system.settings.get("foo");
      expect(systemNs.settings.get).toHaveBeenCalledWith("foo");
      expect(val).toBe("value-42");
    });

    it("propagates errors from the factory promise", async () => {
      const target: any = {};
      const factory = vi.fn().mockRejectedValue(new Error("factory boom"));

      defineLazyNamespace(target, "auth", factory);

      await expect(target.auth.login()).rejects.toThrow("factory boom");
    });

    it("handles concurrent first accesses (single initPromise)", async () => {
      const target: any = {};
      let resolveFactory: (v: any) => void;
      const factoryPromise = new Promise((res) => {
        resolveFactory = res;
      });
      const factory = vi.fn(() => factoryPromise as any);

      defineLazyNamespace(target, "widgets", factory);

      const p1 = target.widgets.list();
      const p2 = target.widgets.list();

      // Resolve after both started
      const fake = { list: vi.fn().mockResolvedValue("ok") };
      resolveFactory!(fake);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("ok");
      expect(r2).toBe("ok");
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });
});
