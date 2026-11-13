/**
 * @file tests/unit/services/audit-chain-anchor.test.ts
 * @description The out-of-database anchor: the half of tamper-evidence the DB
 * checkpoint cannot provide.
 *
 * WHY: the checkpoint catches a deleted chain tail — unless the actor also
 * deletes the checkpoint row, which sits in the same database. The anchor is
 * written to a filesystem path the database cannot reach, so a chain shortened
 * in the DB still disagrees with it.
 *
 * ### Features:
 * - the anchor is written on every committed checkpoint, atomically
 * - an unwritable anchor is counted and logged, never thrown
 * - verification fails when the anchor head is no longer in the chain, even if
 *   the DB checkpoint was deleted with the tail
 * - no configured anchor (or none on disk yet) is not an integrity failure
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditChainService, resetAuditAnchorCache } from "@src/services/audit-chain";

type Row = Record<string, unknown>;

const db = (globalThis as Record<string, unknown>).mockDbAdapter as {
  system: { preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  crud: Record<string, unknown>;
};

const HEAD = "b".repeat(64);
let anchorDir = "";

/** Minimal `auditLogs` reader the verifier walks. */
function installRows(rows: Row[]): void {
  db.crud.findMany = vi.fn(async (_collection: string, _filter: unknown, options: unknown) => {
    const direction = (options as { sort?: { timestamp?: string } })?.sort?.timestamp;
    const sorted = [...rows].sort((a, b) =>
      String(a.timestamp) < String(b.timestamp)
        ? -1
        : String(a.timestamp) > String(b.timestamp)
          ? 1
          : 0,
    );
    const ordered = direction === "desc" ? sorted.reverse() : sorted;
    return {
      success: true,
      data: ordered.slice(0, (options as { limit?: number })?.limit ?? ordered.length),
    };
  });
}

describe("audit chain independent anchor", () => {
  beforeEach(async () => {
    anchorDir = await mkdtemp(join(tmpdir(), "svelty-audit-anchor-"));
    process.env.AUDIT_ANCHOR_PATH = anchorDir;
    resetAuditAnchorCache();
    db.system.preferences.get = vi.fn(async () => ({ success: true, data: null }));
    db.system.preferences.set = vi.fn(async () => ({ success: true }));
    installRows([]);
  });

  afterEach(async () => {
    delete process.env.AUDIT_ANCHOR_PATH;
    resetAuditAnchorCache();
    await rm(anchorDir, { recursive: true, force: true });
  });

  it("writes an anchor atomically on every committed checkpoint", async () => {
    const service = new AuditChainService();
    await service.commitCheckpoint("tenant-a", HEAD, 7);

    const raw = await readFile(join(anchorDir, "audit-anchor-tenant-a.json"), "utf8");
    const anchor = JSON.parse(raw);
    expect(anchor).toMatchObject({ headHash: HEAD, entryCount: 7, scope: "tenant-a" });
    expect(anchor.updatedAt).toBeTypeOf("string");

    expect(await service.readAnchor("tenant-a")).toMatchObject({ headHash: HEAD, entryCount: 7 });
    expect(service.getAnchorStatus("tenant-a").healthy).toBe(true);
  });

  it("counts an unwritable anchor instead of failing the write", async () => {
    process.env.AUDIT_ANCHOR_PATH = join(anchorDir, "not-a-directory");
    await writeFile(process.env.AUDIT_ANCHOR_PATH, "occupied");
    resetAuditAnchorCache();

    const service = new AuditChainService();
    await expect(service.commitCheckpoint("tenant-a", HEAD, 3)).resolves.toBeUndefined();

    const status = service.getAnchorStatus("tenant-a");
    expect(status.healthy).toBe(false);
    expect(status.consecutiveFailures).toBe(1);
    expect(status.lastMessage).toBeTruthy();
  });

  it("keeps one anchor file per tenant scope", async () => {
    const service = new AuditChainService();
    await service.commitCheckpoint("tenant-a", "a".repeat(64), 1);
    await service.commitCheckpoint("tenant-b", "c".repeat(64), 2);
    await service.commitCheckpoint(null, "d".repeat(64), 3);

    expect((await service.readAnchor("tenant-a"))?.entryCount).toBe(1);
    expect((await service.readAnchor("tenant-b"))?.entryCount).toBe(2);
    expect((await service.readAnchor(null))?.entryCount).toBe(3);
  });

  it("reports 'present: false' when no anchor exists yet", async () => {
    const service = new AuditChainService();
    const result = await service.verifyChain("tenant-a");

    expect(result.valid).toBe(true);
    expect(result.anchor).toMatchObject({ configured: true, present: false, matched: false });
  });

  it("fails verification when the chain was shortened and the DB checkpoint is gone", async () => {
    const service = new AuditChainService();
    // One chained row survives, so the chain is NOT empty — the anchor is the only
    // remaining evidence that more entries existed. (An empty chain is reported as
    // empty rather than tampered: see the next test and
    // `audit-chain-empty-chain.test.ts`.)
    const surviving = await service.append({
      action: "login",
      tenantId: "tenant-a",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    await service.commitCheckpoint("tenant-a", HEAD, 9);
    // The actor deleted the newest rows *and* the checkpoint row; the anchor survives.
    db.system.preferences.get = vi.fn(async () => ({ success: true, data: null }));
    installRows([surviving]);

    const result = await service.verifyChain("tenant-a");

    expect(result.valid).toBe(false);
    expect(result.anchor).toMatchObject({ present: true, expectedHead: HEAD, matched: false });
    expect(result.details?.some((line) => line.includes("anchor head"))).toBe(true);
  });

  it("does not report tampering for an empty chain with a surviving anchor", async () => {
    const service = new AuditChainService();
    await service.commitCheckpoint("tenant-a", HEAD, 9);
    // A reset (fresh database, same install directory) leaves the anchor behind.
    installRows([]);

    const result = await service.verifyChain("tenant-a");

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.brokenAt).toBeNull();
    expect(result.anchor).toMatchObject({ present: true, expectedHead: HEAD, matched: false });
    const details = (result.details ?? []).join(" ").toLowerCase();
    expect(details).toContain("empty");
    expect(details).not.toContain("tamper");
    expect(details).not.toContain("truncat");
  });
});
