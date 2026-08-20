/**
 * @file tests/unit/databases/config-state-env-only.test.ts
 * @description
 * Regression guard for the env-only SQLite `DB_HOST` default in
 * `getEnvOverrides()` (src/databases/config-state.ts).
 *
 * `privateConfigSchema` requires `DB_HOST` (minLength ≥ 1), but env-only
 * assemblies (benchmark/test runs without a config/private*.ts file)
 * legitimately omit host/port/credentials for sqlite. `getEnvOverrides(true)`
 * must therefore inject "127.0.0.1", while file-based (`envOnly === false`)
 * and non-sqlite paths must stay untouched (fail-closed). Removing the
 * `else if (envOnly)` sqlite default would silently break benchmark/test
 * config assembly — these tests lock that behavior in.
 *
 * `getEnvOverrides` reads the environment at call time via `runtimeEnv()`
 * (`globalThis.process.env`), so no `vi.resetModules()` is needed — plain
 * `process.env` manipulation with snapshot/restore is sufficient.
 *
 * ### Features:
 * - env-only sqlite DB_HOST default ("127.0.0.1")
 * - explicit DB_HOST passthrough (never overwritten)
 * - file-based configs untouched (no injection)
 * - non-sqlite env-only fail-closed (no injection)
 * - full env-only override assembly (JWT/encryption/test secret passthrough)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnvOverrides } from "@src/databases/config-state";

/** Env keys this suite mutates. Snapshot/restore keeps test isolation. */
const MUTATED_ENV_KEYS = [
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "TEST_API_SECRET",
] as const;

let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = Object.fromEntries(MUTATED_ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of MUTATED_ENV_KEYS) {
    const original = envSnapshot[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("getEnvOverrides env-only sqlite DB_HOST default", () => {
  it("injects 127.0.0.1 for sqlite env-only when DB_HOST is absent", () => {
    process.env.DB_TYPE = "sqlite";

    const overrides = getEnvOverrides(true);

    expect(overrides.DB_HOST).toBe("127.0.0.1");
    // Sqlite must not pick up relational/network credential fields.
    expect(overrides.DB_PORT).toBeUndefined();
    expect(overrides.DB_USER).toBeUndefined();
    expect(overrides.DB_PASSWORD).toBeUndefined();
  });

  it("respects an explicit DB_HOST for sqlite env-only (not overwritten)", () => {
    process.env.DB_TYPE = "sqlite";
    process.env.DB_HOST = "192.168.50.10";

    const overrides = getEnvOverrides(true);

    expect(overrides.DB_HOST).toBe("192.168.50.10");
  });

  it("does not inject DB_HOST in file-based mode (envOnly=false) for sqlite", () => {
    process.env.DB_TYPE = "sqlite";

    const overrides = getEnvOverrides(false);

    // A real config/private.ts missing DB_HOST must still fail validation.
    expect(overrides.DB_HOST).toBeUndefined();
  });

  it("does not inject DB_HOST for non-sqlite env-only (fail-closed)", () => {
    process.env.DB_TYPE = "postgresql";

    const overrides = getEnvOverrides(true);

    expect(overrides.DB_HOST).toBeUndefined();
  });

  it("copies DB_HOST for non-sqlite env-only when explicitly present", () => {
    process.env.DB_TYPE = "mariadb";
    process.env.DB_HOST = "db.internal.example";

    const overrides = getEnvOverrides(true);

    expect(overrides.DB_HOST).toBe("db.internal.example");
  });

  it("assembles a full env-only sqlite override set with the DB_HOST default", () => {
    const jwtSecret = "j".repeat(64); // Schema requires ≥32 chars for realism.
    const encryptionKey = "e".repeat(64);
    process.env.DB_TYPE = "sqlite";
    process.env.DB_NAME = "benchmark-db";
    process.env.JWT_SECRET_KEY = jwtSecret;
    process.env.ENCRYPTION_KEY = encryptionKey;
    process.env.TEST_API_SECRET = "test-secret-abc";

    const overrides = getEnvOverrides(true);

    expect(overrides.DB_HOST).toBe("127.0.0.1");
    expect(overrides.DB_NAME).toBe("benchmark-db");
    expect(overrides.JWT_SECRET_KEY).toBe(jwtSecret);
    expect(overrides.ENCRYPTION_KEY).toBe(encryptionKey);
    expect(overrides.TEST_API_SECRET).toBe("test-secret-abc");
  });
});
