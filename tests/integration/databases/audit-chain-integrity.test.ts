/**
 * @file tests/integration/databases/audit-chain-integrity.test.ts
 * @description Audit-chain integrity through the real write path on the adapter under test.
 *
 * ### Why this file exists
 * Gate 5 asks for the hash chain to be proven on real storage, not on a mocked adapter:
 * a chain that verifies in a unit test but breaks on PostgreSQL is not evidence. It also
 * covers the two writes that a per-tenant cache masks — entries written in the same
 * millisecond, whose `timestamp` ties make any timestamp-only ordering ambiguous.
 *
 * ### Coverage:
 * - GENESIS anchor + linear `previousHash` linkage for a fresh tenant
 * - A burst of same-millisecond entries verifies (deterministic walk order)
 * - Tampering with a stored field is detected at the right entry
 * - Deleting a middle entry is detected (deletion, not just modification)
 * - Two tenants keep independent chains
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { auditService, AuditEventType } from "@src/services/security/audit-service";
import { auditChainService, AUDIT_CHECKPOINT_KEY, GENESIS_HASH } from "@src/services/audit-chain";
import type { DatabaseId } from "@src/databases/db-interface";
import { generateUUID } from "@utils/native-utils";

const RUN = generateUUID().slice(0, 8);
const TENANT_LINEAR = `chain-linear-${RUN}`;
const TENANT_TAMPER = `chain-tamper-${RUN}`;
const TENANT_DELETE = `chain-delete-${RUN}`;
const TENANT_TRUNCATE = `chain-truncate-${RUN}`;
const tenants = [TENANT_LINEAR, TENANT_TAMPER, TENANT_DELETE, TENANT_TRUNCATE];

let db: any = null;

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  if (!db) throw new Error("Database not initialized");
  if (result?.adapter) db = result.adapter;
  expect(typeof db.crud?.findMany).toBe("function");
  expect(process.env.DISABLE_AUDIT_LOGS).not.toBe("true");
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

/** Writes `count` entries through the real service and persists them. */
async function writeBurst(tenantId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await auditService.log(
      `chain-probe-${i}`,
      { id: null, email: "probe@svelty.cms", role: "system" },
      { type: "chain_probe", id: null },
      AuditEventType.USER_UPDATED,
      "low",
      { i },
      tenantId as DatabaseId,
    );
  }
  await auditService.flush();
}

async function chainRows(tenantId: string): Promise<any[]> {
  const res = await db.crud.findMany("auditLogs", {}, {
    tenantId,
    sort: { timestamp: "asc", _id: "asc" },
    limit: 200,
  } as any);
  expect(res.success, JSON.stringify(res).slice(0, 300)).toBe(true);
  return res.data ?? [];
}

describe("Audit chain on real storage", () => {
  it("anchors at GENESIS and links every entry to its predecessor", async () => {
    const count = 8;
    await writeBurst(TENANT_LINEAR, count);

    const rows = await chainRows(TENANT_LINEAR);
    expect(rows.length, "audit entries were not persisted").toBe(count);

    for (let i = 0; i < rows.length; i++) {
      expect(typeof rows[i].chainHash, `row ${i} has no chainHash`).toBe("string");
      expect(rows[i].previousHash, `row ${i} previousHash`).toBe(
        i === 0 ? GENESIS_HASH : rows[i - 1].chainHash,
      );
    }
  }, 120_000);

  it("a same-millisecond burst still verifies", async () => {
    // nowISODateString() is cached per millisecond, so a burst shares one timestamp
    // and any timestamp-only ordering is ambiguous. The walk must be deterministic
    // (`_id` is UUIDv7, i.e. write order) or this reports a false fork.
    const result = await auditChainService.verifyChain(TENANT_LINEAR);
    expect(result.valid, JSON.stringify(result)).toBe(true);
    expect(result.tamperedEntries, JSON.stringify(result)).toBe(0);
    expect(result.details ?? [], JSON.stringify(result)).toEqual([]);
    expect(result.totalEntries).toBeGreaterThanOrEqual(8);
  }, 120_000);

  it("detects a modified entry", async () => {
    await writeBurst(TENANT_TAMPER, 4);
    const rows = await chainRows(TENANT_TAMPER);
    expect(rows.length).toBe(4);

    const target = rows[1];
    const update = await db.crud.update(
      "auditLogs",
      target._id,
      { action: "silently-rewritten" },
      { tenantId: TENANT_TAMPER },
    );
    expect(update.success, JSON.stringify(update).slice(0, 200)).toBe(true);

    const result = await auditChainService.verifyChain(TENANT_TAMPER);
    expect(result.valid, JSON.stringify(result)).toBe(false);
    expect(result.tamperedEntries, JSON.stringify(result)).toBeGreaterThan(0);
  }, 120_000);

  it("detects a deleted entry", async () => {
    await writeBurst(TENANT_DELETE, 4);
    const rows = await chainRows(TENANT_DELETE);
    expect(rows.length).toBe(4);

    const removed = await db.crud.deleteMany(
      "auditLogs",
      { _id: rows[2]._id },
      { tenantId: TENANT_DELETE },
    );
    expect(removed.success, JSON.stringify(removed).slice(0, 200)).toBe(true);

    const result = await auditChainService.verifyChain(TENANT_DELETE);
    expect(result.valid, JSON.stringify(result)).toBe(false);
    expect(result.tamperedEntries, JSON.stringify(result)).toBeGreaterThan(0);
  }, 120_000);

  it("keeps tenants on independent chains", async () => {
    const linear = await chainRows(TENANT_LINEAR);
    const tamper = await chainRows(TENANT_TAMPER);
    const linearHashes = new Set(linear.map((r) => r.chainHash));
    expect(tamper.every((r) => !linearHashes.has(r.chainHash))).toBe(true);

    // Tampering in one tenant must not invalidate another tenant's chain.
    const linearResult = await auditChainService.verifyChain(TENANT_LINEAR);
    expect(linearResult.valid, JSON.stringify(linearResult)).toBe(true);
  }, 120_000);

  it("records a tail checkpoint per tenant after a flush", async () => {
    const rows = await chainRows(TENANT_LINEAR);
    const checkpoint = await auditChainService.readCheckpoint(TENANT_LINEAR);
    expect(checkpoint, "no checkpoint was written by the flush").not.toBeNull();
    expect(checkpoint?.entryCount).toBeGreaterThanOrEqual(rows.length);
    expect(checkpoint?.headHash).toBe(rows[rows.length - 1].chainHash);

    const result = await auditChainService.verifyChain(TENANT_LINEAR);
    expect(result.checkpoint?.matched, JSON.stringify(result)).toBe(true);
  }, 120_000);

  it("detects a truncated tail (newest entries deleted)", async () => {
    await writeBurst(TENANT_TRUNCATE, 5);
    const rows = await chainRows(TENANT_TRUNCATE);
    expect(rows.length).toBe(5);

    const clean = await auditChainService.verifyChain(TENANT_TRUNCATE);
    expect(clean.valid, JSON.stringify(clean)).toBe(true);

    // Deleting from the END leaves a prefix that re-hashes perfectly: without the
    // checkpoint this was undetectable.
    const removed = await db.crud.deleteMany(
      "auditLogs",
      { _id: rows[rows.length - 1]._id },
      { tenantId: TENANT_TRUNCATE },
    );
    expect(removed.success, JSON.stringify(removed).slice(0, 200)).toBe(true);

    const truncated = await auditChainService.verifyChain(TENANT_TRUNCATE);
    expect(truncated.valid, JSON.stringify(truncated)).toBe(false);
    expect(truncated.checkpoint?.matched, JSON.stringify(truncated)).toBe(false);
    expect(truncated.checkpoint?.foundEntries).toBe(4);
    expect(truncated.checkpoint?.expectedEntries).toBe(5);
    expect((truncated.details ?? []).join(" ")).toContain("Tail truncated");
  }, 120_000);
});
