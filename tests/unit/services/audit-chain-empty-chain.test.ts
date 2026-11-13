/**
 * @file tests/unit/services/audit-chain-empty-chain.test.ts
 * @description An empty audit chain is not a tampered chain.
 *
 * WHY: with no rows, `verifyChain()` walked nothing and then compared a stale
 * checkpoint head against the empty `storedHashes` set, reporting "Tail truncated"
 * and `brokenAt: 1`. A brand-new install therefore showed "No audit logs found"
 * next to "Chain Broken at entry #1". Nothing in an empty table can be verified,
 * so the result must stay valid and say so — without tamper wording — while the
 * side records (DB checkpoint, filesystem anchor) stay visible as unmatched.
 *
 * ### Features:
 * - empty chain, no checkpoint → valid, 0 entries, no break
 * - empty chain, stale DB checkpoint → valid, `checkpoint.matched: false`, neutral detail
 * - a non-empty chain with a corrupted payload still fails verification
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditChainService, resetAuditAnchorCache } from "@src/services/audit-chain";

type Row = Record<string, unknown>;

const db = (globalThis as Record<string, unknown>).mockDbAdapter as {
  system: { preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  crud: Record<string, unknown>;
};

const HEAD = "e".repeat(64);

function installRows(rows: Row[]): void {
  db.crud.findMany = vi.fn(async () => ({ success: true, data: rows }));
}

describe("audit chain — empty chain", () => {
  beforeEach(() => {
    delete process.env.AUDIT_ANCHOR_PATH;
    resetAuditAnchorCache();
    db.system.preferences.get = vi.fn(async () => ({ success: true, data: null }));
    db.system.preferences.set = vi.fn(async () => ({ success: true }));
    installRows([]);
  });

  it("reports an empty chain as valid when no checkpoint exists", async () => {
    const result = await new AuditChainService().verifyChain("tenant-fresh");

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.tamperedEntries).toBe(0);
    expect(result.brokenAt).toBeNull();
    expect(result.checkpoint).toBeNull();
    expect(result.details).toBeUndefined();
    expect(result.anchor?.present).toBe(false);
  });

  it("keeps a stale checkpoint from a reset chain out of the tamper verdict", async () => {
    db.system.preferences.get = vi.fn(async () => ({
      success: true,
      data: { headHash: HEAD, entryCount: 12, updatedAt: "2026-01-01T00:00:00.000Z" },
    }));

    const result = await new AuditChainService().verifyChain("tenant-reset");

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.tamperedEntries).toBe(0);
    expect(result.brokenAt).toBeNull();
    expect(result.checkpoint).toMatchObject({
      expectedEntries: 12,
      foundEntries: 0,
      expectedHead: HEAD,
      matched: false,
    });

    const details = (result.details ?? []).join(" ").toLowerCase();
    expect(details).toContain("empty");
    expect(details).not.toContain("tamper");
    expect(details).not.toContain("truncat");
  });

  it("still fails a non-empty chain whose payload was corrupted", async () => {
    const chain = new AuditChainService();
    installRows([]);
    const first = await chain.append({
      action: "login",
      tenantId: "tenant-tamper",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const second = await chain.append({
      action: "update",
      tenantId: "tenant-tamper",
      timestamp: "2026-01-01T00:00:01.000Z",
    });

    // The second row's stored chainHash no longer matches its payload.
    installRows([first, { ...second, action: "deleted" }]);

    const result = await chain.verifyChain("tenant-tamper");

    expect(result.valid).toBe(false);
    expect(result.totalEntries).toBe(2);
    expect(result.tamperedEntries).toBe(1);
    expect(result.brokenAt).toBe(2);
    expect(result.details?.[0]).toContain("Entry #2");
  });
});
