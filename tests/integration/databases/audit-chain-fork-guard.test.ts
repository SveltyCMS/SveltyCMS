/**
 * @file tests/integration/databases/audit-chain-fork-guard.test.ts
 * @description Multi-writer fork prevention: unique `(chainScope, previousHash)` + re-chain.
 *
 * ### Why this file exists
 * Two processes that both read the same chain head each write a child of it, forking the
 * chain. Detection already exists (`verifyChain` reports a break); this suite proves the
 * *prevention*: the unique index rejects the second child, and the flush re-chains onto
 * the head that won instead of losing the entry.
 *
 * The race is reproduced deterministically rather than by timing: the stale hash is
 * computed first, the head is then advanced, and only afterwards is the stale row written.
 *
 * ### Coverage:
 * - a second child of a taken head is rejected by the store
 * - `rechain()` moves the batch onto the current head and the chain still verifies
 * - a flush whose entries lost the race retries and keeps every entry
 * - `chainScope` is persisted, so the guard covers the NULL-tenant (global) chain too
 *
 * ### MongoDB is not covered (documented gap, skipped with a reason)
 * The fork guard is a unique `(chainScope, previousHash)` index created from
 * `SYSTEM_SCHEMA`. MongoDB has no spec-driven index path for system collections
 * (indexes are created per user-collection model), so on MongoDB the constraint does
 * not exist: the retry is a no-op and a fork is still only *detected*, not prevented.
 * Fixing that needs an explicit `createIndex` in the MongoDB adapter's boot.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { auditService, AuditEventType } from "@src/services/security/audit-service";
import {
  auditChainService,
  AUDIT_CHECKPOINT_KEY,
  chainHashScope,
  computeChainHash,
  type ChainedAuditEntry,
} from "@src/services/audit-chain";
import type { DatabaseId } from "@src/databases/db-interface";
import { generateUUID } from "@utils/native-utils";
import { nowISODateString } from "@utils/date";

const RUN = generateUUID().slice(0, 8);
const TENANT = `fork-guard-${RUN}`;
const TENANT_FLUSH = `fork-flush-${RUN}`;
const tenants = [TENANT, TENANT_FLUSH];

/** The unique index comes from `SYSTEM_SCHEMA` — SQL adapters only (see the header). */
const DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();
const HAS_FORK_INDEX = !DB_TYPE.startsWith("mongo");
if (!HAS_FORK_INDEX) {
  console.warn(
    "[audit-chain-fork-guard] guard tests skipped: MongoDB has no spec-driven index for system collections yet — fork prevention is not covered there",
  );
}

let db: any = null;

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  if (!db) throw new Error("Database not initialized");
  if (result?.adapter) db = result.adapter;
  expect(typeof db.crud?.findMany).toBe("function");
}, 120_000);

afterAll(async () => {
  for (const tenantId of tenants) {
    await db?.crud
      ?.deleteMany(
        "auditLogs",
        { tenantId },
        withSystemScope("testing", { permanent: true, confirmWipe: true }),
      )
      .catch(() => {});
    await db?.crud
      ?.deleteMany(
        "systemPreferences",
        { key: AUDIT_CHECKPOINT_KEY, tenantId },
        withSystemScope("testing", { permanent: true, confirmWipe: true }),
      )
      .catch(() => {});
  }
});

async function chainRows(tenantId: string): Promise<any[]> {
  const res = await db.crud.findMany("auditLogs", {}, {
    tenantId,
    sort: { timestamp: "asc", _id: "asc" },
    limit: 200,
  } as any);
  expect(res.success, JSON.stringify(res).slice(0, 300)).toBe(true);
  return res.data ?? [];
}

/** A complete, unstored audit row as the writer would build it. */
function stubEntry(tenantId: string, previousHash: string, label: string): ChainedAuditEntry {
  const timestamp = nowISODateString();
  const entry: ChainedAuditEntry = {
    action: label,
    actorEmail: "probe@svelty.cms",
    actorId: null,
    actorRole: "system",
    eventType: AuditEventType.USER_UPDATED,
    severity: "low",
    result: "success",
    targetId: null,
    targetType: "fork_probe",
    timestamp,
    details: { label },
    tenantId,
    chainScope: chainHashScope(tenantId),
    previousHash,
  };
  return { ...entry, chainHash: computeChainHash(entry, previousHash) };
}

async function writeBurst(tenantId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await auditService.log(
      `fork-probe-${i}`,
      { id: null, email: "probe@svelty.cms", role: "system" },
      { type: "fork_probe", id: null },
      AuditEventType.USER_UPDATED,
      "low",
      { i },
      tenantId as DatabaseId,
    );
  }
  await auditService.flush();
}

describe("Audit chain fork guard", () => {
  it("persists chainScope so the NULL-tenant chain is constrained too", async () => {
    await writeBurst(TENANT, 2);
    const rows = await chainRows(TENANT);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.chainScope === TENANT)).toBe(true);
    expect(rows[0].chainScope).toBe(chainHashScope(TENANT));
  }, 120_000);

  it.skipIf(!HAS_FORK_INDEX)(
    "rejects a second child of a head that another writer already extended",
    async () => {
      const rows = await chainRows(TENANT);
      const staleHead = rows[rows.length - 1].chainHash;

      // A second process computed this child from `staleHead`…
      const staleEntry = stubEntry(TENANT, staleHead, "stale-child");

      // …meanwhile the chain advanced: its previousHash now belongs to a stored row.
      await writeBurst(TENANT, 1);

      const rejected = await db.crud.insert(
        "auditLogs",
        { ...staleEntry, _id: generateUUID() },
        { tenantId: TENANT },
      );
      expect(rejected.success, "the fork guard must reject a duplicate (scope, previousHash)").toBe(
        false,
      );

      // Recovery: re-chain onto the head that won, then store.
      const [rechained] = await auditChainService.rechain([staleEntry]);
      expect(rechained.previousHash).not.toBe(staleHead);
      const accepted = await db.crud.insert(
        "auditLogs",
        { ...rechained, _id: generateUUID() },
        { tenantId: TENANT },
      );
      expect(accepted.success, JSON.stringify(accepted).slice(0, 200)).toBe(true);

      const result = await auditChainService.verifyChain(TENANT);
      expect(result.valid, JSON.stringify(result)).toBe(true);
      expect(result.totalEntries).toBe(4);
    },
    120_000,
  );

  it.skipIf(!HAS_FORK_INDEX)(
    "retries a flush whose entries lost the race and keeps every entry",
    async () => {
      await writeBurst(TENANT_FLUSH, 1);
      const before = await chainRows(TENANT_FLUSH);

      // Buffer one entry (hashed onto the current head)…
      await auditService.log(
        "raced-entry",
        { id: null, email: "probe@svelty.cms", role: "system" },
        { type: "fork_probe", id: null },
        AuditEventType.USER_UPDATED,
        "low",
        { raced: true },
        TENANT_FLUSH as DatabaseId,
      );

      // …then let another writer take that head before the flush runs. The winner is
      // built from the head read BEFORE the buffered entry, i.e. exactly what a second
      // process computed: using `append()` here would chain after the still-buffered
      // entry (shared in-process cache) and never produce the race.
      const head = before[before.length - 1].chainHash;
      const winner = stubEntry(TENANT_FLUSH, head, "winner");
      const stored = await db.crud.insert(
        "auditLogs",
        { ...winner, _id: generateUUID() },
        { tenantId: TENANT_FLUSH },
      );
      expect(stored.success, JSON.stringify(stored).slice(0, 200)).toBe(true);

      // The flush now hits the unique index, re-chains, and succeeds.
      await auditService.flush();

      const rows = await chainRows(TENANT_FLUSH);
      expect(rows.map((r) => r.action)).toContain("raced-entry");
      expect(rows.length).toBe(3);
      const result = await auditChainService.verifyChain(TENANT_FLUSH);
      expect(result.valid, JSON.stringify(result)).toBe(true);
    },
    120_000,
  );
});
