/**
 * @file tests/unit/databases/replica-router-boot.test.ts
 * @description
 * Unit tests for Option 4 read-replica boot wiring: `DB_REPLICAS` env parsing
 * and the db.ts bootstrap that constructs and exposes the ReplicaRouterAdapter.
 *
 * Mocked boundaries: adapter construction (loadAdapters), replica connection
 * (adapter.connect), pool pre-warm (preWarmConnectionPool), router construction
 * (createReplicaRouterAdapter) and the tenant-guard wrappers. The env parser
 * itself is exercised against its real implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { IDBAdapter } from "@src/databases/db-interface";

// The shared test setup mocks @src/databases/db globally — restore the real
// module here so the boot wiring under test is the production code.
vi.mock("@src/databases/db", async (importOriginal) => importOriginal());

// Keep the real parser; mock only the router factory boundary.
vi.mock("@src/databases/core/replica-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/databases/core/replica-router")>();
  return { ...actual, createReplicaRouterAdapter: vi.fn() };
});

vi.mock("@src/databases/db-init", () => ({
  loadAdapters: vi.fn(),
  initializeDatabase: vi.fn(),
  dbPluginRegistry: { register: vi.fn(), reset: vi.fn(), bootAll: vi.fn() },
}));

vi.mock("@src/databases/database-resilience", () => ({
  preWarmConnectionPool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@src/databases/crud-tenant-guard", () => ({
  createTenantGuardedCrud: vi.fn((inner: unknown) => inner),
  createTenantGuardedNamespace: vi.fn((ns: unknown) => ns),
}));

vi.mock("@src/databases/core/cache-module", () => ({
  createCountCachedCrud: vi.fn((inner: unknown) => inner),
}));

import { createReplicaRouterAdapter, parseDbReplicasEnv } from "@src/databases/core/replica-router";
import { loadAdapters } from "@src/databases/db-init";
import { preWarmConnectionPool } from "@src/databases/database-resilience";
import { bootstrapReplicaRouter, getReplicaRouter, getReplicaStats } from "@src/databases/db";

/** Global key the boot wiring exposes the router under (REPLICA_ROUTER_KEY). */
const REPLICA_ROUTER_GLOBAL = "__DB_REPLICA_ROUTER__";

interface ReplicaMock {
  type: string;
  connect: Mock;
  crud: Record<string, unknown>;
  auth: Record<string, unknown>;
}

function makeReplicaAdapter(): ReplicaMock {
  return {
    type: "postgresql",
    connect: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    crud: {},
    auth: {},
  };
}

describe("parseDbReplicasEnv (DB_REPLICAS parsing)", () => {
  it("returns an empty list for unset, null, blank, whitespace and comma-only input", () => {
    expect(parseDbReplicasEnv(undefined)).toEqual([]);
    expect(parseDbReplicasEnv(null)).toEqual([]);
    expect(parseDbReplicasEnv("")).toEqual([]);
    expect(parseDbReplicasEnv("   ")).toEqual([]);
    expect(parseDbReplicasEnv(",")).toEqual([]);
    expect(parseDbReplicasEnv(", ,")).toEqual([]);
  });

  it("parses a single host:port entry", () => {
    expect(parseDbReplicasEnv("replica-a:5432")).toEqual([{ host: "replica-a", port: 5432 }]);
  });

  it("parses comma-separated entries and trims whitespace around them", () => {
    expect(parseDbReplicasEnv("host1:5432, host2:5433 ,host3:5434")).toEqual([
      { host: "host1", port: 5432 },
      { host: "host2", port: 5433 },
      { host: "host3", port: 5434 },
    ]);
  });

  it("parses bracketed IPv6 literals", () => {
    expect(parseDbReplicasEnv("[::1]:5432")).toEqual([{ host: "::1", port: 5432 }]);
  });

  it("ignores trailing commas and empty segments", () => {
    expect(parseDbReplicasEnv("host1:5432,")).toEqual([{ host: "host1", port: 5432 }]);
  });

  it("skips entries with missing, non-numeric or out-of-range ports", () => {
    expect(parseDbReplicasEnv("host:0,host:65536,host:-1,host:abc,host:")).toEqual([]);
    expect(parseDbReplicasEnv("host:99999")).toEqual([]);
  });

  it("skips entries without a host", () => {
    expect(parseDbReplicasEnv(":5432,host2:5432")).toEqual([{ host: "host2", port: 5432 }]);
  });

  it("keeps valid entries when others are malformed", () => {
    expect(parseDbReplicasEnv("garbage,host2:5432,noport")).toEqual([
      { host: "host2", port: 5432 },
    ]);
  });
});

describe("bootstrapReplicaRouter (Option 4 boot wiring)", () => {
  const primary = { type: "postgresql" } as unknown as IDBAdapter;

  beforeEach(() => {
    vi.resetAllMocks();
    // resetAllMocks strips the factory-set implementation — re-arm the pre-warm boundary.
    (preWarmConnectionPool as unknown as Mock).mockResolvedValue(undefined);
    (globalThis as Record<string, unknown>)[REPLICA_ROUTER_GLOBAL] = null;
  });

  it("constructs tenant-guarded replicas, connects them to their own host:port, pre-warms pools and exposes the router", async () => {
    const replicaA = makeReplicaAdapter();
    const replicaB = makeReplicaAdapter();
    (loadAdapters as unknown as Mock)
      .mockResolvedValueOnce(replicaA)
      .mockResolvedValueOnce(replicaB);

    const router = {
      getReplicaStats: vi.fn().mockReturnValue({ primaryWrites: 1, replicaReads: 9 }),
    };
    (createReplicaRouterAdapter as unknown as Mock).mockReturnValue(router);

    const cfg = {
      DB_USER: "cms",
      DB_PASSWORD: "secret",
      DB_NAME: "sveltycms",
      replicaSettings: { readYourWritesWindowMs: 5000 },
    };

    const result = await bootstrapReplicaRouter(
      primary,
      [
        { host: "replica-a", port: 5432 },
        { host: "replica-b", port: 5433 },
      ],
      cfg,
    );

    expect(result).toBe(router);
    expect(loadAdapters).toHaveBeenCalledTimes(2);
    expect(loadAdapters).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        host: "replica-a",
        port: 5432,
        DB_HOST: "replica-a",
        DB_PORT: 5432,
        readReplicas: [],
      }),
    );
    expect(replicaA.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "replica-a",
        port: 5432,
        user: "cms",
        password: "secret",
        database: "sveltycms",
      }),
    );
    expect(replicaB.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: "replica-b", port: 5433 }),
    );
    expect(preWarmConnectionPool).toHaveBeenCalledTimes(2);
    expect(preWarmConnectionPool).toHaveBeenNthCalledWith(1, replicaA);
    expect(createReplicaRouterAdapter).toHaveBeenCalledWith(primary, [replicaA, replicaB], {
      readYourWritesWindowMs: 5000,
    });
    expect(getReplicaRouter()).toBe(router);
    expect(getReplicaStats()).toEqual({ primaryWrites: 1, replicaReads: 9 });
  });

  it("is a no-op for an empty target list (default-off) — no adapter work, no router", async () => {
    const result = await bootstrapReplicaRouter(primary, [], null);

    expect(result).toBeNull();
    expect(loadAdapters).not.toHaveBeenCalled();
    expect(createReplicaRouterAdapter).not.toHaveBeenCalled();
    expect(preWarmConnectionPool).not.toHaveBeenCalled();
    expect(getReplicaRouter()).toBeNull();
  });

  it("fails open to primary-only when every replica fails to connect", async () => {
    const replica = makeReplicaAdapter();
    replica.connect.mockResolvedValue({ success: false, message: "connection refused" });
    (loadAdapters as unknown as Mock).mockResolvedValue(replica);

    const result = await bootstrapReplicaRouter(primary, [{ host: "replica-a", port: 5432 }], null);

    expect(result).toBeNull();
    expect(createReplicaRouterAdapter).not.toHaveBeenCalled();
    expect(preWarmConnectionPool).not.toHaveBeenCalled();
    expect(getReplicaRouter()).toBeNull();
  });

  it("skips a replica that cannot be constructed and routes through the healthy one", async () => {
    const replicaB = makeReplicaAdapter();
    (loadAdapters as unknown as Mock)
      .mockRejectedValueOnce(new Error("unsupported engine"))
      .mockResolvedValueOnce(replicaB);

    const router = { getReplicaStats: vi.fn() };
    (createReplicaRouterAdapter as unknown as Mock).mockReturnValue(router);

    const result = await bootstrapReplicaRouter(
      primary,
      [
        { host: "broken", port: 5432 },
        { host: "replica-b", port: 5433 },
      ],
      null,
    );

    expect(result).toBe(router);
    expect(loadAdapters).toHaveBeenCalledTimes(2);
    expect(createReplicaRouterAdapter).toHaveBeenCalledWith(primary, [replicaB], undefined);
    expect(getReplicaRouter()).toBe(router);
  });

  it("returns null when the adapter factory yields no instance for every target", async () => {
    (loadAdapters as unknown as Mock).mockResolvedValue(null);

    const result = await bootstrapReplicaRouter(primary, [{ host: "replica-a", port: 5432 }], null);

    expect(result).toBeNull();
    expect(createReplicaRouterAdapter).not.toHaveBeenCalled();
    expect(getReplicaRouter()).toBeNull();
  });
});

describe("getReplicaRouter / getReplicaStats exposure", () => {
  afterEach(() => {
    (globalThis as Record<string, unknown>)[REPLICA_ROUTER_GLOBAL] = null;
  });

  it("returns null when no router was exposed", () => {
    expect(getReplicaRouter()).toBeNull();
    expect(getReplicaStats()).toBeNull();
  });

  it("returns live diagnostics from the exposed router", () => {
    const stats = { primaryWrites: 3, replicaReads: 42 };
    const router = { getReplicaStats: vi.fn().mockReturnValue(stats) };
    (globalThis as Record<string, unknown>)[REPLICA_ROUTER_GLOBAL] = router;

    expect(getReplicaRouter()).toBe(router);
    expect(getReplicaStats()).toEqual(stats);
  });
});
