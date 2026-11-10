/**
 * @file tests/unit/services/audit-chain-writer.test.ts
 * @description The audit WRITE path, not just the verifier.
 *
 * The chain service used to be dead code: `verifyChain()` walked a chain that
 * nothing wrote, and the real writer (`AuditService.log`) hashed a private
 * serialisation of its own with a single global last-hash slot. These tests pin
 * the contract between writer and verifier:
 *
 * - appends link tenant-scoped, genesis-anchored chain hashes
 * - `verifyChain()` — which re-serialises from the DB rows — agrees with them
 * - tampering with one payload breaks verification at that entry
 * - concurrent appends produce exactly one linear chain
 * - a full buffer evicts the oldest entries and counts them
 * - append stays in the microsecond range (perf regression guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The global unit setup replaces the audit service with a no-op mock; this
// suite exercises the real writer, so opt out before importing it.
vi.unmock("@src/services/security/audit-service");

import { AuditChainService, GENESIS_HASH } from "@src/services/audit-chain";
import { AuditService, AuditEventType } from "@src/services/security/audit-service";

type Row = Record<string, any>;

interface FakeStore {
  rows: Row[];
}

/** The global mock adapter is the object `audit-chain`/`audit-service` import. */
const db = (globalThis as any).mockDbAdapter as { crud: Record<string, any> };

/**
 * In-memory stand-in for the `auditLogs` table. Sorting mirrors the verifier's
 * query (`timestamp asc|desc`) and is stable, so rows written in one
 * millisecond keep their insertion order — the same assumption the writer makes
 * via the per-ms timestamp cache.
 */
function installFakeStore(): FakeStore {
  const store: FakeStore = { rows: [] };

  db.crud.findMany = vi.fn(async (_collection: string, filter: any, options: any) => {
    let rows = store.rows.filter((row) => !filter?.tenantId || row.tenantId === filter.tenantId);
    const direction = (options?.sort as Row | undefined)?.timestamp;
    if (direction !== undefined) {
      const desc = direction === "desc" || direction === -1;
      rows = [...rows].sort((a, b) => {
        if (a.timestamp === b.timestamp) return 0;
        const less = a.timestamp < b.timestamp;
        return (less ? -1 : 1) * (desc ? -1 : 1);
      });
    }
    return { success: true, data: rows.slice(0, options?.limit ?? rows.length) };
  });

  db.crud.insertMany = vi.fn(async (_collection: string, entries: Row[]) => {
    for (const entry of entries) {
      // Copy like a real adapter round-trip would (no shared references).
      store.rows.push({ ...entry, details: { ...entry.details } });
    }
    return { success: true, data: entries };
  });

  db.crud.insert = vi.fn(async () => ({ success: true, data: {} }));

  return store;
}

function storedEntry(action: string, tenantId: string, timestamp: string, details: Row = {}) {
  return {
    action,
    tenantId,
    timestamp,
    actorEmail: "admin@example.com",
    actorRole: "admin",
    eventType: "data_import",
    severity: "low",
    result: "success",
    details,
  };
}

describe("audit chain writer (AuditService.log → AuditChainService → verifyChain)", () => {
  beforeEach(() => {
    // Default: an enabled, async audit pipeline.
    delete process.env.DISABLE_AUDIT_LOGS;
    delete process.env.AUDIT_CHAIN_SYNC;
    installFakeStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends three entries and verifyChain() accepts the chain", async () => {
    const store = installFakeStore();
    const chain = new AuditChainService();

    const first = await chain.append(storedEntry("login", "tenant-a", "2026-01-01T00:00:00.000Z"));
    const second = await chain.append(
      storedEntry("update", "tenant-a", "2026-01-01T00:00:01.000Z"),
    );
    const third = await chain.append(storedEntry("logout", "tenant-a", "2026-01-01T00:00:02.000Z"));

    expect(first.previousHash).toBe(GENESIS_HASH);
    expect(second.previousHash).toBe(first.chainHash);
    expect(third.previousHash).toBe(second.chainHash);
    for (const entry of [first, second, third]) {
      expect(entry.chainHash).toMatch(/^[0-9a-f]{64}$/);
    }

    // Persist through the same adapter call AuditService.flush() uses, then
    // verify from what the database would return — not from the return values.
    await db.crud.insertMany("auditLogs", [first, second, third]);
    expect(store.rows).toHaveLength(3);

    const result = await chain.verifyChain("tenant-a");
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.totalEntries).toBe(3);
    expect(result.tamperedEntries).toBe(0);
  });

  it("fails verification at the tampered entry index when a payload changes", async () => {
    const store = installFakeStore();
    const chain = new AuditChainService();

    // Use the real writer so the test also covers `AuditService.log()`.
    const service = new AuditService({ flushIntervalMs: 60_000, microBatchMs: 60_000 });
    try {
      for (const action of ["login", "update", "logout"]) {
        await service.log(
          action,
          { id: "usr_1" as any, email: "admin@example.com", role: "admin" },
          { type: "auth", id: "auth_1" as any },
          AuditEventType.USER_LOGIN,
          "low",
          { session: action },
          "tenant-a" as any,
        );
      }
      await service.flush();
    } finally {
      await service.shutdown();
    }

    expect(store.rows).toHaveLength(3);
    expect((await chain.verifyChain("tenant-a")).valid).toBe(true);

    // Tamper with the SECOND entry's payload only; its stored chainHash no
    // longer matches the canonical payload.
    store.rows[1].details = { session: "forged" };

    const result = await chain.verifyChain("tenant-a");
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.tamperedEntries).toBe(1);
    expect(result.details?.[0]).toContain("Entry #2");
  });

  it("50 concurrent appends form one linear chain with no duplicate previousHash", async () => {
    installFakeStore();
    const chain = new AuditChainService();
    const CONCURRENCY = 50;
    // Same millisecond: the audit writer caches timestamps per ms, so this is
    // the realistic shape and it makes the persisted order unambiguous.
    const timestamp = "2026-02-02T00:00:00.000Z";

    const entries = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        chain.append(storedEntry(`concurrent_${i}`, "tenant-c", timestamp, { i })),
      ),
    );

    const previousHashes = entries.map((entry) => entry.previousHash as string);
    expect(new Set(previousHashes).size).toBe(CONCURRENCY);
    expect(previousHashes.filter((hash) => hash === GENESIS_HASH)).toHaveLength(1);
    expect(new Set(entries.map((entry) => entry.chainHash)).size).toBe(CONCURRENCY);

    // Walk the links: every chainHash except the last must be some entry's
    // previousHash, and the walk must visit every entry exactly once.
    const byPrevious = new Map(entries.map((entry) => [entry.previousHash as string, entry]));
    const ordered: typeof entries = [];
    let cursor = GENESIS_HASH;
    while (byPrevious.has(cursor) && ordered.length <= CONCURRENCY) {
      const next = byPrevious.get(cursor)!;
      ordered.push(next);
      cursor = next.chainHash as string;
    }
    expect(ordered).toHaveLength(CONCURRENCY);

    for (const entry of ordered) {
      await db.crud.insertMany("auditLogs", [entry]);
    }
    const result = await chain.verifyChain("tenant-c");
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(CONCURRENCY);
    expect(result.tamperedEntries).toBe(0);
  });

  it("drops the oldest entries when the buffer is full and counts every drop", async () => {
    installFakeStore();
    const service = new AuditService({
      maxBufferSize: 100, // never auto-flush during the test
      maxTotalBuffer: 3,
      flushIntervalMs: 60_000,
      microBatchMs: 60_000,
    });

    try {
      for (let i = 0; i < 5; i++) {
        await service.log(
          `overflow_${i}`,
          { id: `usr_${i}` as any, email: "admin@example.com" },
          { type: "test", id: `res_${i}` as any },
          AuditEventType.DATA_EXPORT,
          "low",
          {},
          "tenant-d" as any,
        );
      }

      const buffered = (service as any).buffer as Row[];
      expect(buffered.map((entry) => entry.action)).toEqual([
        "overflow_2",
        "overflow_3",
        "overflow_4",
      ]);
      expect(service.getDroppedEntryCount()).toBe(2);
    } finally {
      await service.shutdown();
    }
  });

  it("keeps tenants on separate chains (no cross-tenant previousHash)", async () => {
    installFakeStore();
    const chain = new AuditChainService();

    const a1 = await chain.append(storedEntry("a1", "tenant-x", "2026-04-04T00:00:00.000Z"));
    const b1 = await chain.append(storedEntry("b1", "tenant-y", "2026-04-04T00:00:00.000Z"));
    const a2 = await chain.append(storedEntry("a2", "tenant-x", "2026-04-04T00:00:01.000Z"));

    expect(a1.previousHash).toBe(GENESIS_HASH);
    expect(b1.previousHash).toBe(GENESIS_HASH);
    expect(a2.previousHash).toBe(a1.chainHash);

    for (const entry of [a1, b1, a2]) {
      await db.crud.insertMany("auditLogs", [entry]);
    }
    expect((await chain.verifyChain("tenant-x")).valid).toBe(true);
    expect((await chain.verifyChain("tenant-y")).valid).toBe(true);

    // An untenanted verification must not swallow tenanted rows.
    const global = await chain.verifyChain();
    expect(global.valid).toBe(true);
    expect(global.totalEntries).toBe(0);
  });

  it("keeps the append hot path in the microsecond range (100k iterations)", async () => {
    installFakeStore();
    const chain = new AuditChainService();
    const tenantId = "tenant-perf";
    const timestamp = "2026-03-03T00:00:00.000Z";

    // Warm the per-tenant head cache so the measurement is the steady state,
    // not one DB round-trip.
    await chain.append(storedEntry("warmup", tenantId, timestamp));

    const ITERATIONS = 100_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) {
      await chain.append(storedEntry("perf", tenantId, timestamp, { i }));
    }
    const elapsedNs = Number(process.hrtime.bigint() - start);
    const usPerEntry = elapsedNs / 1000 / ITERATIONS;

    console.log(
      `[audit-chain] append cost: ${usPerEntry.toFixed(3)} µs/entry (${ITERATIONS} iterations, ${(elapsedNs / 1e6).toFixed(1)} ms total)`,
    );

    // Generous ceiling: this guards against a DB round-trip (or async crypto)
    // creeping back onto the hot path; the measured value is far lower.
    expect(usPerEntry).toBeLessThan(250);
  }, 120_000);
});
