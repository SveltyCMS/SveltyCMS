/**
 * @file tests/unit/services/setup-missing-db-auth.test.ts
 * @description A missing target database is not proof of valid credentials.
 *
 * WHY: `testDatabaseConnection()` used to answer a "database ... does not exist"
 * error with `success: true, willCreate: true`, on the assumption that PostgreSQL
 * and MySQL authenticate before resolving the name. QA reproduced a false success
 * with a NON-EXISTENT PostgreSQL role and a dummy password, so the wizard promised
 * to create a database it could never connect to. The probe now proves the
 * credentials against a maintenance database (`template1`/`postgres`, `mysql`)
 * before promising anything.
 *
 * ### Features:
 * - missing target + successful maintenance probe → success + willCreate
 * - missing target + rejected maintenance probe → failure (AUTH_FAILED), no willCreate
 * - the probe reuses the setup adapter factory with a read-only target override
 * - a failed `template1` falls back to `postgres`; MariaDB targets `mysql`
 * - the configured password never reaches the returned payload
 * - non-target errors keep the existing `classifyDatabaseError` path
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const setupAdapterMock = vi.hoisted(() => vi.fn());

vi.mock("@src/services/setup/setup-utils", () => ({
  getSetupDatabaseAdapter: setupAdapterMock,
  buildDatabaseConnectionString: () => "/tmp/svelty-setup-test.sqlite",
}));

import { testDatabaseConnection } from "@src/services/setup/setup.server";

const TARGET_DB = "sveltycms";
const PASSWORD = "Pa55word!";

const postgresConfig = {
  type: "postgresql",
  host: "db.example.com",
  port: "5432",
  name: TARGET_DB,
  user: "svelty",
  password: PASSWORD,
};

const mariadbConfig = {
  type: "mariadb",
  host: "db.example.com",
  port: "3306",
  name: TARGET_DB,
  user: "svelty",
  password: PASSWORD,
};

function missingTargetError(code = "3D000"): Error & { code: string } {
  const err = new Error(`database "${TARGET_DB}" does not exist`) as Error & { code: string };
  err.code = code;
  return err;
}

/** Minimal adapter surface the maintenance probe touches. */
function createProbeAdapter() {
  return {
    getConnectionHealth: vi.fn(async () => ({
      success: true,
      data: { healthy: true, latency: 1, activeConnections: 1 },
    })),
    disconnect: vi.fn(async () => ({ success: true, data: undefined })),
  };
}

/** Contract-shaped view of the probe payload, so assertions stay typed. */
interface ProbeResult {
  success: boolean;
  willCreate?: boolean;
  classification?: string;
  error?: string;
  message?: string;
  details?: unknown;
  [key: string]: unknown;
}

function probe(config: typeof postgresConfig | typeof mariadbConfig): Promise<ProbeResult> {
  return testDatabaseConnection(config) as Promise<ProbeResult>;
}

describe("setup: missing database must not bypass authentication", () => {
  beforeEach(() => {
    setupAdapterMock.mockReset();
  });

  it("proves the credentials against template1 before promising willCreate", async () => {
    const probeAdapter = createProbeAdapter();
    setupAdapterMock.mockImplementation(async (config: { name: string }) => {
      if (config.name === TARGET_DB) throw missingTargetError();
      return { dbAdapter: probeAdapter, connectionString: "postgresql://redacted" };
    });

    const result = await probe(postgresConfig);

    expect(result.success).toBe(true);
    expect(result.willCreate).toBe(true);

    // First call = the real target, second = the maintenance database.
    expect(setupAdapterMock).toHaveBeenCalledTimes(2);
    expect(setupAdapterMock.mock.calls[1][0]).toMatchObject({
      name: "template1",
      host: postgresConfig.host,
      user: postgresConfig.user,
      password: PASSWORD,
    });

    // Same read-only probe contract as the target probe: nothing is provisioned.
    expect(setupAdapterMock.mock.calls[1][1]).toMatchObject({
      createIfMissing: false,
      skipModuleInit: true,
      readOnlyProbe: true,
    });

    expect(probeAdapter.getConnectionHealth).toHaveBeenCalledOnce();
    expect(probeAdapter.disconnect).toHaveBeenCalledOnce();
  });

  it("fails when the maintenance probe rejects the credentials", async () => {
    setupAdapterMock.mockImplementation(async (config: { name: string }) => {
      if (config.name === TARGET_DB) throw missingTargetError();
      throw new Error('password authentication failed for user "svelty"');
    });

    const result = await probe(postgresConfig);

    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("willCreate");
    expect(result.classification).toBe("AUTH_FAILED");

    // Both maintenance databases were tried before giving up.
    expect(setupAdapterMock.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual([
      TARGET_DB,
      "template1",
      "postgres",
    ]);
  });

  it("falls back to the postgres maintenance database when template1 is unavailable", async () => {
    const probeAdapter = createProbeAdapter();
    setupAdapterMock.mockImplementation(async (config: { name: string }) => {
      if (config.name === TARGET_DB) throw missingTargetError();
      if (config.name === "template1") throw new Error("permission denied for database template1");
      return { dbAdapter: probeAdapter, connectionString: "postgresql://redacted" };
    });

    const result = await probe(postgresConfig);

    expect(result.success).toBe(true);
    expect(result.willCreate).toBe(true);
    expect(setupAdapterMock.mock.calls[2][0]).toMatchObject({ name: "postgres" });
  });

  it("proves MariaDB credentials against the mysql schema", async () => {
    const probeAdapter = createProbeAdapter();
    setupAdapterMock.mockImplementation(async (config: { name: string }) => {
      if (config.name === TARGET_DB) {
        throw missingTargetError("ER_BAD_DB_ERROR");
      }
      return { dbAdapter: probeAdapter, connectionString: "mysql://redacted" };
    });

    const result = await probe(mariadbConfig);

    expect(result.success).toBe(true);
    expect(result.willCreate).toBe(true);
    expect(setupAdapterMock.mock.calls[1][0]).toMatchObject({ name: "mysql" });
  });

  it("never leaks the configured password into the returned payload", async () => {
    setupAdapterMock.mockImplementation(async (config: { name: string }) => {
      if (config.name === TARGET_DB) throw missingTargetError();
      throw new Error(
        `connection to postgresql://svelty:${PASSWORD}@${postgresConfig.host}/${TARGET_DB} failed`,
      );
    });

    const result = await probe(postgresConfig);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    expect(JSON.stringify(result)).toContain("[redacted]");
  });

  it("keeps non-target errors on the existing classification path", async () => {
    const refused = new Error("connect ECONNREFUSED 127.0.0.1:5432") as Error & { code: string };
    refused.code = "ECONNREFUSED";
    setupAdapterMock.mockImplementation(async () => {
      throw refused;
    });

    const result = await probe(postgresConfig);

    expect(result.success).toBe(false);
    expect(result.classification).toBe("CONNECTION_REFUSED");
    // No maintenance probe: the error was never a "missing target" signal.
    expect(setupAdapterMock).toHaveBeenCalledOnce();
  });
});
