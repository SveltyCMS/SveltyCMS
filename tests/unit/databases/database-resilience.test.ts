/**
 * @file tests/unit/databases/database-resilience.test.ts
 * @description Whitebox proofs for real db.ts boot helpers — not mock-only stubs.
 *
 * Covers resetDbInitPromise, getBootPhase, isDbConnected, and ensureFullInitialization
 * CORRUPT_CONFIG fail-fast (MISSING_CONFIG). Uses ?bun-unmock so setup.ts's global
 * @src/databases/db mock is not the only proof.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobal } from "@src/utils/native-utils";

const ADAPTER_KEY = "__DB_ADAPTER_INSTANCE__";
const INIT_PROMISE_KEY = "__DB_INIT_PROMISE__";
const BOOT_PHASE_KEY = "__BOOT_PHASE__";
const AUTH_KEY = "__AUTH_INSTANCE__";

async function loadRealDb() {
  return import("@src/databases/db?bun-unmock=" + Date.now());
}

describe("Database Resilience (real db.ts)", () => {
  let realDb: Awaited<ReturnType<typeof loadRealDb>>;

  beforeEach(async () => {
    realDb = await loadRealDb();
    // Isolate boot globals from other suites
    setGlobal(INIT_PROMISE_KEY, null);
    setGlobal(BOOT_PHASE_KEY, "IDLE");
    setGlobal(ADAPTER_KEY, null);
    setGlobal(AUTH_KEY, null);
    delete process.env.CORRUPT_CONFIG;
  });

  afterEach(() => {
    delete process.env.CORRUPT_CONFIG;
    setGlobal(INIT_PROMISE_KEY, null);
    setGlobal(BOOT_PHASE_KEY, "IDLE");
    setGlobal(ADAPTER_KEY, null);
    setGlobal(AUTH_KEY, null);
  });

  it("resetDbInitPromise clears init promise and returns phase to IDLE", () => {
    setGlobal(INIT_PROMISE_KEY, Promise.resolve({ ok: true }));
    setGlobal(BOOT_PHASE_KEY, "READY");

    expect(() => realDb.resetDbInitPromise()).not.toThrow();
    expect(realDb.getBootPhase()).toBe("IDLE");

    // Calling again is idempotent
    realDb.resetDbInitPromise();
    expect(realDb.getBootPhase()).toBe("IDLE");
  });

  it("isDbConnected is false without an adapter and true when connected", () => {
    expect(realDb.isDbConnected()).toBe(false);

    setGlobal(ADAPTER_KEY, {
      isConnected: () => true,
      crud: {},
      auth: {},
    });
    expect(realDb.isDbConnected()).toBe(true);

    setGlobal(ADAPTER_KEY, {
      isConnected: () => false,
      crud: {},
      auth: {},
    });
    expect(realDb.isDbConnected()).toBe(false);
  });

  it("getDb returns the registered adapter instance", () => {
    const adapter = { isConnected: () => true, mark: "real-adapter" };
    setGlobal(ADAPTER_KEY, adapter);
    expect(realDb.getDb()).toBe(adapter);
  });

  it("ensureFullInitialization fails fast with MISSING_CONFIG when CORRUPT_CONFIG=true", async () => {
    process.env.CORRUPT_CONFIG = "true";
    realDb.resetDbInitPromise();

    try {
      await realDb.ensureFullInitialization();
      expect.unreachable("Boot should have thrown MISSING_CONFIG");
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code || err.body?.code).toBe("MISSING_CONFIG");
      expect(err.message).toContain("corrupted or missing");
      // Phase must be FAILED after crash
      expect(realDb.getBootPhase()).toBe("FAILED");
    } finally {
      delete process.env.CORRUPT_CONFIG;
      realDb.resetDbInitPromise();
    }
  });

  it("ensureFullInitialization does not short-circuit to READY under CORRUPT_CONFIG even if a stale promise exists", async () => {
    // Stale promise from a previous mock suite must not hide CORRUPT_CONFIG
    setGlobal(INIT_PROMISE_KEY, Promise.resolve({ adapter: { isConnected: () => true } }));
    setGlobal(BOOT_PHASE_KEY, "READY");
    setGlobal(ADAPTER_KEY, { isConnected: () => false }); // force re-init path

    process.env.CORRUPT_CONFIG = "true";

    try {
      await realDb.ensureFullInitialization();
      expect.unreachable("Expected MISSING_CONFIG");
    } catch (err: any) {
      expect(err.code || err.body?.code).toBe("MISSING_CONFIG");
    } finally {
      delete process.env.CORRUPT_CONFIG;
      realDb.resetDbInitPromise();
    }
  });
});
