/**
 * @file tests/unit/plugins/unified-data-hub/postgres-pool-cache.test.ts
 * @description Postgres per-connector pool cache behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllPostgresPools,
  getPooledPostgres,
  getPostgresPoolStats,
  invalidatePostgresPool,
} from "@plugins/unified-data-hub/server/postgres-pool-cache";

describe("Postgres pool cache", () => {
  beforeEach(async () => {
    await clearAllPostgresPools();
  });

  afterEach(async () => {
    await clearAllPostgresPools();
  });

  it("reuses pool for same connectorId", () => {
    const a = getPooledPostgres("conn-1", "postgres://u:p@127.0.0.1:5432/db");
    const b = getPooledPostgres("conn-1", "postgres://u:p@127.0.0.1:5432/db");
    expect(a).toBe(b);
    expect(getPostgresPoolStats().activePools).toBe(1);
  });

  it("creates separate pools per connectorId", () => {
    const a = getPooledPostgres("conn-a", "postgres://u:p@127.0.0.1:5432/db");
    const b = getPooledPostgres("conn-b", "postgres://u:p@127.0.0.1:5432/db");
    expect(a).not.toBe(b);
    expect(getPostgresPoolStats().activePools).toBe(2);
  });

  it("invalidates pool on connector credential change", async () => {
    getPooledPostgres("conn-x", "postgres://u:p@127.0.0.1:5432/db");
    expect(getPostgresPoolStats().activePools).toBe(1);
    await invalidatePostgresPool("conn-x");
    expect(getPostgresPoolStats().activePools).toBe(0);
  });
});
