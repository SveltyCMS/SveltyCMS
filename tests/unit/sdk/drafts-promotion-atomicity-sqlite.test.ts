/**
 * @file tests/unit/sdk/drafts-promotion-atomicity-sqlite.test.ts
 * @description Real-SQLite contract for atomic publish promotion.
 *
 * `drafts.promoteDraft()` must commit the live write, the revision snapshot and
 * the `content_drafts` delete as one transaction on SQL adapters, and keep the
 * ordered live-write-then-delete fallback when the adapter reports no
 * transaction support.
 *
 * ### Features:
 * - happy path: live row + revision + draft delete all committed
 * - rollback when the draft delete fails after the live write/revision
 * - rollback when the revision snapshot write fails
 * - ordered fallback for a non-transactional adapter (no `transaction` call)
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import { bootstrapSystemSchema } from "@src/databases/core/system-schema-bootstrap";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { DraftsNamespace } from "@src/services/sdk/namespaces/drafts-namespace";
import { revisionSnapshot } from "@src/services/sdk/namespaces/collections/revisions";
import type {
  ContentDraft,
  ContentRevision,
  DatabaseId,
  DatabaseResult,
  PaginatedResult,
} from "@src/databases/db-interface";
import { StatusTypes, type Schema } from "@src/content/types";
import { generateUUID } from "@src/utils/native-utils";

const COLLECTION = "drafts_atomicity_contract";
const TENANT = "tenant-sdk-atomicity" as DatabaseId;

const schema: Schema = {
  _id: COLLECTION,
  name: COLLECTION,
  slug: COLLECTION,
  revision: true,
  revisionLimit: 100,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
} as Schema;

const author = {
  _id: "atomic-author",
  email: "atomic@test.dev",
  role: "admin",
  isAdmin: true,
};

const user = author as never;

function unwrap<T>(result: DatabaseResult<T>): T {
  if (!result.success) throw new Error(result.message ?? "Draft operation failed");
  return result.data;
}

describe("promoteDraft atomicity on SQLite", () => {
  let adapter: SQLiteAdapter;
  let drafts: DraftsNamespace;

  async function seedLiveEntry(title: string): Promise<string> {
    const entryId = generateUUID();
    unwrap(
      await adapter.crud.insert(COLLECTION, { _id: entryId, title, status: "draft" } as never, {
        tenantId: TENANT,
      }),
    );
    return entryId;
  }

  async function stageEntryDraft(entryId: string, title: string): Promise<ContentDraft> {
    return unwrap(
      await drafts.saveDraft(COLLECTION, { entryId, data: { title } }, { user, tenantId: TENANT }),
    );
  }

  async function liveRow(entryId: string): Promise<Record<string, unknown>> {
    return unwrap(
      await adapter.crud.findOne(COLLECTION, { _id: entryId } as never, { tenantId: TENANT }),
    ) as unknown as Record<string, unknown>;
  }

  async function revisionRows(entryId: string): Promise<ContentRevision[]> {
    return unwrap<PaginatedResult<ContentRevision>>(
      await adapter.content.revisions.getHistory(entryId as DatabaseId, {
        page: 1,
        pageSize: 10,
      }),
    ).items;
  }

  async function draftFor(entryId: string): Promise<ContentDraft | null> {
    return unwrap(await drafts.getDraft(COLLECTION, entryId, { user, tenantId: TENANT }));
  }

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);

    // Bootstrap system tables without `provision()`: its SQLite migration lock
    // (`config/database/.migration.lock`) is process-wide, and a parallel
    // SQLite unit file that wins the race makes the loser skip the DDL pass
    // silently — leaving `content_drafts`/`content_revisions` absent. The
    // bootstrap itself is `CREATE TABLE IF NOT EXISTS`, i.e. safe to run here.
    await bootstrapSystemSchema("sqlite", (adapter as unknown as { _sqlite: unknown })._sqlite);
    await adapter.createModel(schema);

    const collections = new CollectionsNamespace(adapter, {
      getCollection: async (id: string) => (id === COLLECTION ? schema : null),
    } as never);
    drafts = new DraftsNamespace(adapter, collections);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("commits the live row, revision snapshot and draft delete in one transaction", async () => {
    const entryId = await seedLiveEntry("live before promotion");
    const draft = await stageEntryDraft(entryId, "staged atomic title");

    const transactionSpy = vi.spyOn(adapter, "transaction");
    const promoted = (await drafts.promoteDraft(COLLECTION, String(draft._id), {
      user,
      tenantId: TENANT,
      status: StatusTypes.publish,
    })) as DatabaseResult<Record<string, unknown>>;

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(promoted.success).toBe(true);
    expect(unwrap(promoted)._id).toBe(entryId);

    const live = await liveRow(entryId);
    expect(live.title).toBe("staged atomic title");
    expect(live.status).toBe(StatusTypes.publish);

    // The pre-write snapshot is the row promotion replaced, written on the same
    // transaction connection as the live UPDATE.
    const revisions = await revisionRows(entryId);
    expect(revisions).toHaveLength(1);
    expect(revisionSnapshot(revisions[0] as unknown as Record<string, unknown>)?.title).toBe(
      "live before promotion",
    );

    expect(await draftFor(entryId)).toBeNull();
  });

  it("rolls back the live write and revision when the draft delete fails", async () => {
    const entryId = await seedLiveEntry("rollback base title");
    const draft = await stageEntryDraft(entryId, "must not reach the live row");

    vi.spyOn(adapter.content.drafts, "delete").mockResolvedValue({
      success: false,
      message: "injected draft-delete failure",
      error: { code: "INJECTED_DRAFT_DELETE", message: "injected draft-delete failure" },
    });

    const promoted = await drafts.promoteDraft(COLLECTION, String(draft._id), {
      user,
      tenantId: TENANT,
      status: StatusTypes.publish,
    });
    expect(promoted.success).toBe(false);

    // The UPDATE and the revision INSERT already ran inside the transaction;
    // both must be gone after the failed delete rolls it back.
    const live = await liveRow(entryId);
    expect(live.title).toBe("rollback base title");
    expect(await revisionRows(entryId)).toHaveLength(0);

    // A rolled-back promotion leaves the draft untouched and retryable.
    const remaining = await draftFor(entryId);
    expect(remaining?._id).toBe(draft._id);
  });

  it("rolls back the live write when the revision snapshot fails", async () => {
    const entryId = await seedLiveEntry("revision rollback base");
    const draft = await stageEntryDraft(entryId, "live write must roll back too");

    vi.spyOn(adapter.content.revisions, "create").mockResolvedValue({
      success: false,
      message: "injected revision failure",
      error: { code: "INJECTED_REVISION", message: "injected revision failure" },
    });

    await expect(
      drafts.promoteDraft(COLLECTION, String(draft._id), {
        user,
        tenantId: TENANT,
        status: StatusTypes.publish,
      }),
    ).rejects.toMatchObject({ status: 500, code: "REVISION_WRITE_FAILED" });

    const live = await liveRow(entryId);
    expect(live.title).toBe("revision rollback base");
    expect(await revisionRows(entryId)).toHaveLength(0);
    expect((await draftFor(entryId))?._id).toBe(draft._id);
  });

  it("keeps the ordered live-write-then-delete fallback without transaction support", async () => {
    const entryId = await seedLiveEntry("fallback base title");
    const draft = await stageEntryDraft(entryId, "fallback staged title");

    vi.spyOn(adapter, "getCapabilities").mockReturnValue({
      ...adapter.getCapabilities(),
      supportsTransactions: false,
    });
    const transactionSpy = vi.spyOn(adapter, "transaction");

    const promoted = unwrap(
      await drafts.promoteDraft(COLLECTION, String(draft._id), {
        user,
        tenantId: TENANT,
        status: StatusTypes.publish,
      }),
    ) as Record<string, unknown>;

    // The fallback path still promotes and records the revision; it just does
    // not claim multi-document atomicity by opening a transaction.
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(promoted._id).toBe(entryId);
    expect((await liveRow(entryId)).title).toBe("fallback staged title");
    expect(await revisionRows(entryId)).toHaveLength(1);
    expect(await draftFor(entryId)).toBeNull();
  });
});
