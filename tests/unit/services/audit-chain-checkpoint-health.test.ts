/**
 * @file tests/unit/services/audit-chain-checkpoint-health.test.ts
 * @description A checkpoint that silently fails to persist is a compliance
 * event, not a log line: without it nothing detects a deleted chain tail.
 *
 * WHY: `commitCheckpoint()` used to `logger.warn` and return. An operator had
 * no way to learn that the anchor was stale, and the admin verification screen
 * still reported "Chain Valid" because the comparison had nothing to compare
 * against.
 *
 * ### Features:
 * - a rejected write is counted, logged at error level and reported as unhealthy
 * - a later successful write clears the state
 * - `verifyChain()` carries the same status so the UI can refuse a bare "valid"
 * - state is per tenant (one tenant's failure cannot mask another's)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditChainService } from "@src/services/audit-chain";

const db = (globalThis as Record<string, unknown>).mockDbAdapter as {
  system: { preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  crud: Record<string, unknown>;
};

const HEAD = "a".repeat(64);

describe("audit chain checkpoint health", () => {
  beforeEach(() => {
    db.system.preferences.get = vi.fn(async () => ({ success: true, data: null }));
    db.system.preferences.set = vi.fn(async () => ({ success: true }));
    db.crud.findMany = vi.fn(async () => ({ success: true, data: [] }));
  });

  it("reports healthy before any failure", () => {
    const service = new AuditChainService();
    expect(service.getCheckpointStatus("tenant-a")).toEqual({
      healthy: true,
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastMessage: null,
    });
  });

  it("counts consecutive failures instead of only warning", async () => {
    const service = new AuditChainService();
    db.system.preferences.set = vi.fn(async () => ({ success: false, message: "disk full" }));

    await service.commitCheckpoint("tenant-a", HEAD, 3);
    await service.commitCheckpoint("tenant-a", HEAD, 2);

    const status = service.getCheckpointStatus("tenant-a");
    expect(status.healthy).toBe(false);
    expect(status.consecutiveFailures).toBe(2);
    expect(status.lastMessage).toBe("disk full");
    expect(status.lastFailureAt).toBeTruthy();
  });

  it("clears the state on the next successful write", async () => {
    const service = new AuditChainService();
    db.system.preferences.set = vi.fn(async () => ({ success: false, message: "unavailable" }));
    await service.commitCheckpoint("tenant-a", HEAD, 1);
    expect(service.getCheckpointStatus("tenant-a").healthy).toBe(false);

    db.system.preferences.set = vi.fn(async () => ({ success: true }));
    await service.commitCheckpoint("tenant-a", HEAD, 1);
    expect(service.getCheckpointStatus("tenant-a").healthy).toBe(true);
  });

  it("keeps tenant state separate", async () => {
    const service = new AuditChainService();
    db.system.preferences.set = vi.fn(async (_key: string, _value: unknown, options: unknown) => {
      const tenantId = (options as { tenantId?: string } | undefined)?.tenantId;
      return tenantId === "tenant-b" ? { success: false, message: "locked" } : { success: true };
    });

    await service.commitCheckpoint("tenant-a", HEAD, 1);
    await service.commitCheckpoint("tenant-b", HEAD, 1);

    expect(service.getCheckpointStatus("tenant-a").healthy).toBe(true);
    expect(service.getCheckpointStatus("tenant-b").healthy).toBe(false);
  });

  it("carries the status into the verification result", async () => {
    const service = new AuditChainService();
    db.system.preferences.set = vi.fn(async () => ({ success: false, message: "read-only" }));
    await service.commitCheckpoint("tenant-a", HEAD, 4);

    const result = await service.verifyChain("tenant-a");

    expect(result.valid).toBe(true);
    expect(result.checkpointPersistence).toMatchObject({
      healthy: false,
      consecutiveFailures: 1,
      lastMessage: "read-only",
    });
  });
});
