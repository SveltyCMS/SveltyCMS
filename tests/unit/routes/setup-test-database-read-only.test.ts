/**
 * @file tests/unit/routes/setup-test-database-read-only.test.ts
 * @description The setup wizard's "Test Database Connection" probe must be
 * read-only: it validates connectivity/auth/existence but never creates the
 * database file or system tables, never seeds, and never writes
 * `config/private.ts` before the user commits (wizard Next/Complete).
 *
 * The adapter factory is a boundary mock; the private-config writer and the
 * seeder are spies that must stay untouched. A couple of cases use the real
 * filesystem to prove a missing SQLite probe does not materialize the target.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const adapter = {
    getConnectionHealth: vi.fn(async () => ({
      success: true,
      data: { healthy: true, latency: 1, activeConnections: 1 },
    })),
    isEmpty: vi.fn(async () => ({ success: true, data: true })),
    ensureAuth: vi.fn(async () => {}),
    ensureSystem: vi.fn(async () => {}),
    ensureCollections: vi.fn(async () => {}),
    ensureContent: vi.fn(async () => {}),
    auth: { setupAuthModels: vi.fn(async () => {}) },
    disconnect: vi.fn(async () => ({ success: true })),
  };

  return {
    adapter,
    getSetupDatabaseAdapter: vi.fn(async () => ({
      dbAdapter: adapter,
      connectionString: "probe",
    })),
    buildDatabaseConnectionString: vi.fn(() => "/nonexistent-sveltycms-probe/db.sqlite"),
    writePrivateConfig: vi.fn(async () => {}),
    updatePrivateConfigMode: vi.fn(async () => {}),
    initSystemFast: vi.fn(async () => ({})),
  };
});

vi.mock("@src/services/setup/setup-utils", () => ({
  getSetupDatabaseAdapter: h.getSetupDatabaseAdapter,
  buildDatabaseConnectionString: h.buildDatabaseConnectionString,
}));

vi.mock("@src/services/setup/write-private-config", () => ({
  writePrivateConfig: h.writePrivateConfig,
  updatePrivateConfigMode: h.updatePrivateConfigMode,
}));

vi.mock("@src/services/setup/seed", () => ({
  initSystemFast: h.initSystemFast,
}));

import { testDatabaseConnection } from "@src/services/setup/setup.server";

const MISSING_SQLITE_PATH = "/nonexistent-sveltycms-probe/db.sqlite";
const EXISTING_FILE_PATH = path.resolve(process.cwd(), "package.json");

const sqliteConfig = () => ({
  type: "sqlite",
  host: "config/database",
  port: "",
  name: "probe.sqlite",
});

function expectNoProvisioningCalls() {
  expect(h.adapter.ensureAuth).not.toHaveBeenCalled();
  expect(h.adapter.ensureSystem).not.toHaveBeenCalled();
  expect(h.adapter.ensureCollections).not.toHaveBeenCalled();
  expect(h.adapter.ensureContent).not.toHaveBeenCalled();
  expect(h.adapter.auth.setupAuthModels).not.toHaveBeenCalled();
  expect(h.writePrivateConfig).not.toHaveBeenCalled();
  expect(h.updatePrivateConfigMode).not.toHaveBeenCalled();
  expect(h.initSystemFast).not.toHaveBeenCalled();
}

describe("setup testDatabaseConnection — read-only probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.adapter.getConnectionHealth.mockResolvedValue({
      success: true,
      data: { healthy: true, latency: 1, activeConnections: 1 },
    });
    h.adapter.isEmpty.mockResolvedValue({ success: true, data: true });
    h.buildDatabaseConnectionString.mockReturnValue(MISSING_SQLITE_PATH);
  });

  it("reports a missing SQLite file as will-create without creating it", async () => {
    const result = await testDatabaseConnection(sqliteConfig());

    expect(result).toMatchObject({ success: true, willCreate: true });
    expect(h.getSetupDatabaseAdapter).not.toHaveBeenCalled();
    expect(h.adapter.disconnect).not.toHaveBeenCalled();
    expect(existsSync(MISSING_SQLITE_PATH)).toBe(false);
    expectNoProvisioningCalls();
  });

  it("connects read-only and never initializes modules or writes private config", async () => {
    h.buildDatabaseConnectionString.mockReturnValue(EXISTING_FILE_PATH);

    const result = await testDatabaseConnection(sqliteConfig());

    expect(result).toMatchObject({ success: true, willCreate: true });
    expect(h.getSetupDatabaseAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sqlite" }),
      {
        createIfMissing: false,
        skipModuleInit: true,
        readOnlyProbe: true,
      },
    );
    expect(h.adapter.getConnectionHealth).toHaveBeenCalledTimes(1);
    expect(h.adapter.isEmpty).toHaveBeenCalledTimes(1);
    expect(h.adapter.disconnect).toHaveBeenCalledTimes(1);
    expectNoProvisioningCalls();
  });

  it("ignores the legacy createIfMissing flag and never forces creation", async () => {
    h.buildDatabaseConnectionString.mockReturnValue(EXISTING_FILE_PATH);

    await testDatabaseConnection(sqliteConfig(), true);

    expect(h.getSetupDatabaseAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sqlite" }),
      expect.objectContaining({ createIfMissing: false }),
    );
    expectNoProvisioningCalls();
  });

  it("rejects a foreign non-empty database without touching it", async () => {
    h.buildDatabaseConnectionString.mockReturnValue(EXISTING_FILE_PATH);
    h.adapter.isEmpty.mockResolvedValue({ success: true, data: false });

    // The emptiness guard has a TEST_MODE bypass (harness DBs are pre-seeded);
    // disable it for this assertion so the production path runs.
    const previousTestMode = process.env.TEST_MODE;
    process.env.TEST_MODE = "false";
    try {
      const result = await testDatabaseConnection(sqliteConfig());

      expect(result).toMatchObject({ success: false, canOverwrite: true });
      expect(h.adapter.disconnect).toHaveBeenCalledTimes(1);
      expectNoProvisioningCalls();
    } finally {
      process.env.TEST_MODE = previousTestMode;
    }
  });

  it("treats a missing server database as will-create instead of creating it", async () => {
    h.getSetupDatabaseAdapter.mockRejectedValueOnce(
      new Error('Module initialization failed: database "cms" does not exist'),
    );

    const result = await testDatabaseConnection({
      type: "postgresql",
      host: "db.internal",
      port: 5432,
      name: "cms",
      user: "cms",
      password: "secret",
    });

    expect(result).toMatchObject({ success: true, willCreate: true });
    expectNoProvisioningCalls();
  });

  it("keeps reporting real connection failures", async () => {
    h.getSetupDatabaseAdapter.mockRejectedValueOnce(
      new Error("Module initialization failed: Authentication failed"),
    );

    const result = await testDatabaseConnection({
      type: "postgresql",
      host: "db.internal",
      port: 5432,
      name: "cms",
      user: "cms",
      password: "wrong",
    });

    expect(result).toMatchObject({ success: false, classification: "AUTH_FAILED" });
    expectNoProvisioningCalls();
  });
});
