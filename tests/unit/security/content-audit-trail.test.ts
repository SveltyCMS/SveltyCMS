/**
 * @file tests/unit/security/content-audit-trail.test.ts
 * @description Content mutations must land in `audit_logs` so an entry's
 * "Audit History" panel is populated, and the chain must stay verifiable.
 *
 * WHY: the HTTP audit hook only sees `/api/*` mutations and is disabled under
 * `TEST_MODE`, while the SDK write path wrote revisions only. Create / update /
 * delete / publish therefore left no audit row at all. The SDK now calls
 * `auditService.recordContentChange()`, which uses the same `log()` append path
 * (canonical payload, `targetId` = entry id) as every other audit entry.
 *
 * ### Features:
 * - publish / create / update / delete map to their own event type + label
 * - `targetId` is the content entry id (what the sidebar panel queries)
 * - tenant + actor are carried through, secrets are never added by the helper
 * - an empty chain still verifies as valid with 0 entries
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@src/services/security/audit-service");

import { AuditChainService, resetAuditAnchorCache } from "@src/services/audit-chain";
import { AuditEventType, AuditService } from "@src/services/security/audit-service";
import type { DatabaseId } from "@src/databases/db-interface";

type Row = Record<string, unknown>;

/** Tenant ids are branded at the DB boundary; the audit API keeps the brand. */
const TENANT = "tenant-a" as DatabaseId;

const db = (globalThis as Record<string, unknown>).mockDbAdapter as {
  system: { preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  crud: Record<string, unknown>;
};

describe("content audit trail", () => {
  beforeEach(() => {
    delete process.env.AUDIT_ANCHOR_PATH;
    resetAuditAnchorCache();
    db.system.preferences.get = vi.fn(async () => ({ success: true, data: null }));
    db.system.preferences.set = vi.fn(async () => ({ success: true }));
    db.crud.findMany = vi.fn(async () => ({ success: true, data: [] as Row[] }));
  });

  it("records a publish against the entry id with the content event type", async () => {
    const service = new AuditService();
    const logSpy = vi.spyOn(service, "log").mockResolvedValue(undefined);

    await service.recordContentChange({
      action: "publish",
      collectionId: "pages",
      collectionName: "Pages",
      entryId: "entry-1",
      tenantId: TENANT,
      actor: { id: "user-1", email: "editor@example.com", role: "editor" },
      status: "publish",
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [action, actor, resource, eventType, severity, details, tenant] = logSpy.mock.calls[0];

    expect(action).toBe("Content published");
    expect(actor).toMatchObject({ id: "user-1", email: "editor@example.com", role: "editor" });
    // The panel filters by targetId only — it must be the content entry.
    expect(resource).toEqual({ type: "content", id: "entry-1" });
    expect(eventType).toBe(AuditEventType.CONTENT_PUBLISHED);
    expect(severity).toBe("medium");
    expect(details).toMatchObject({
      collectionId: "pages",
      collection: "Pages",
      entryId: "entry-1",
      operation: "publish",
      status: "publish",
    });
    expect(tenant).toBe("tenant-a");

    logSpy.mockRestore();
    await service.shutdown();
  });

  it("maps create, update and delete to distinct labels and event types", async () => {
    const service = new AuditService();
    const logSpy = vi.spyOn(service, "log").mockResolvedValue(undefined);
    const base = {
      collectionId: "pages",
      entryId: "entry-2",
      tenantId: TENANT,
      actor: { id: "user-1", email: "editor@example.com" },
    };

    await service.recordContentChange({ ...base, action: "create", status: "unpublish" });
    await service.recordContentChange({ ...base, action: "update", status: "unpublish" });
    await service.recordContentChange({ ...base, action: "delete" });

    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      "Content created",
      "Content updated",
      "Content deleted",
    ]);
    expect(logSpy.mock.calls.map((call) => call[3])).toEqual([
      AuditEventType.CONTENT_CREATED,
      AuditEventType.CONTENT_UPDATED,
      AuditEventType.CONTENT_DELETED,
    ]);

    logSpy.mockRestore();
    await service.shutdown();
  });

  it("keeps an empty chain valid with zero entries", async () => {
    const result = await new AuditChainService().verifyChain("tenant-without-audit-rows");

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.tamperedEntries).toBe(0);
    expect(result.brokenAt).toBeNull();
  });
});
