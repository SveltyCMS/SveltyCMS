/**
 * @file tests/unit/sdk/drafts-namespace-sqlite.test.ts
 * @description Real-SQLite contract for `cms.drafts` — the SDK half of
 * draft/live separation.
 *
 * ### Features:
 * - autosave writes `content_drafts` and never the live collection row
 * - a new-entry draft is resumable via its own `contentId` and keeps its marker
 * - entry drafts strip the internal `__draft` marker
 * - promotion writes the staged data through the normal update lane (revision
 *   snapshot included) and removes the draft only after the live write lands
 * - a failed live write leaves the draft intact (retry-safe)
 * - reads/deletes/promotions are author scoped; another author's draft is a 404
 * - unknown collection and anonymous access fail closed
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
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

const COLLECTION = "drafts_sdk_contract";
const TENANT = "tenant-sdk-drafts" as DatabaseId;

const schema: Schema = {
  _id: COLLECTION,
  name: COLLECTION,
  slug: COLLECTION,
  revision: true,
  revisionLimit: 100,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
} as Schema;

const authorOne = {
  _id: "draft-author-1",
  email: "author1@test.dev",
  role: "admin",
  isAdmin: true,
};
const authorTwo = {
  _id: "draft-author-2",
  email: "author2@test.dev",
  role: "admin",
  isAdmin: true,
};

const user = authorOne as never;
const otherUser = authorTwo as never;

const dataOf = (draft: ContentDraft | null | undefined) =>
  (draft?.data ?? {}) as Record<string, unknown>;

/** `DatabaseResult` is a union — tests read the value or fail with the adapter message. */
function unwrap<T>(result: DatabaseResult<T>): T {
  if (!result.success) throw new Error(result.message ?? "Draft operation failed");
  return result.data;
}

describe("DraftsNamespace on SQLite", () => {
  let adapter: SQLiteAdapter;
  let drafts: DraftsNamespace;
  let newDraft: ContentDraft;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    await (adapter as unknown as { provision: () => Promise<void> }).provision();
    await adapter.createModel(schema);

    const collections = new CollectionsNamespace(adapter, {
      getCollection: async (id: string) => (id === COLLECTION ? schema : null),
    } as never);
    drafts = new DraftsNamespace(adapter, collections);
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("saves a new-entry draft without creating a live row", async () => {
    const saved = await drafts.saveDraft(
      COLLECTION,
      { data: { title: "unsaved", __draft: { kind: "client-junk" } } },
      { user, tenantId: TENANT },
    );
    newDraft = unwrap(saved);

    expect(newDraft.contentId).toBe(newDraft._id);
    expect(newDraft.collectionId).toBe(COLLECTION);
    expect(newDraft.version).toBe(1);
    expect(dataOf(newDraft).__draft).toEqual({ kind: "new" });

    const live = unwrap(await adapter.crud.count(COLLECTION, {} as never, { tenantId: TENANT }));
    expect(live).toBe(0);
  });

  it("resumes a new-entry draft by its own content id and keeps the marker", async () => {
    const resumed = unwrap(
      await drafts.saveDraft(
        COLLECTION,
        { entryId: String(newDraft.contentId), data: { title: "resumed" } },
        { user, tenantId: TENANT },
      ),
    );
    expect(resumed.version).toBe(2);
    expect(dataOf(resumed).title).toBe("resumed");
    expect(dataOf(resumed).__draft).toEqual({ kind: "new" });
    // Still one row, still a new-entry draft.
    expect(resumed.contentId).toBe(resumed._id);
  });

  it("stores entry drafts by live id and strips the internal marker", async () => {
    const entryId = generateUUID();
    unwrap(
      await adapter.crud.insert(
        COLLECTION,
        { _id: entryId, title: "live title", status: "draft" } as never,
        { tenantId: TENANT },
      ),
    );

    const saved = unwrap(
      await drafts.saveDraft(
        COLLECTION,
        { entryId, data: { title: "entry draft", __draft: { kind: "leak" } } },
        { user, tenantId: TENANT },
      ),
    );
    expect(saved.contentId).toBe(entryId);
    expect(dataOf(saved)).not.toHaveProperty("__draft");

    const live = unwrap(
      await adapter.crud.findOne(COLLECTION, { _id: entryId } as never, { tenantId: TENANT }),
    );
    expect((live as { title?: string } | null)?.title).toBe("live title");
  });

  it("returns the caller's latest draft, never another author's", async () => {
    const mine = unwrap(await drafts.getDraft(COLLECTION, undefined, { user, tenantId: TENANT }));
    expect(mine?.contentId).toBe(newDraft.contentId);

    const theirs = unwrap(
      await drafts.getDraft(COLLECTION, undefined, { user: otherUser, tenantId: TENANT }),
    );
    expect(theirs).toBeNull();
  });

  it("discards only the caller's draft and reports foreign ids as 404", async () => {
    await expect(
      drafts.discardDraft(COLLECTION, String(newDraft._id), {
        user: otherUser,
        tenantId: TENANT,
      }),
    ).rejects.toMatchObject({ status: 404 });

    const removed = unwrap(
      await drafts.discardDraft(COLLECTION, String(newDraft._id), { user, tenantId: TENANT }),
    );
    expect(removed.deletedCount).toBe(1);

    const after = unwrap(await drafts.getDraft(COLLECTION, undefined, { user, tenantId: TENANT }));
    expect(after).toBeNull();
  });

  it("discards every draft for an entry, author scoped", async () => {
    const entryId = generateUUID();
    unwrap(
      await drafts.saveDraft(
        COLLECTION,
        { entryId, data: { title: "mine" } },
        {
          user,
          tenantId: TENANT,
        },
      ),
    );

    const theirs = await adapter.content.drafts.upsertDraft(
      {
        authorId: authorTwo._id as DatabaseId,
        collectionId: COLLECTION as DatabaseId,
        contentId: entryId as DatabaseId,
        data: { title: "theirs" },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );
    expect(theirs.success).toBe(true);

    const removed = unwrap(
      await drafts.discardDraftsForEntry(COLLECTION, entryId, { user, tenantId: TENANT }),
    );
    expect(removed.deletedCount).toBe(1);

    const remaining = unwrap<ContentDraft | null>(
      await adapter.content.drafts.getLatestForContent(entryId as DatabaseId, {
        tenantId: TENANT,
      }),
    );
    expect(remaining?.authorId).toBe(authorTwo._id);
  });

  it("fails closed for an unknown collection and for anonymous callers", async () => {
    await expect(
      drafts.saveDraft("missing-collection", { data: { title: "x" } }, { user, tenantId: TENANT }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      drafts.saveDraft(COLLECTION, { data: { title: "x" } }, { tenantId: TENANT }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("promotes a staged entry draft into the live row and records the previous revision", async () => {
    const entryId = generateUUID();
    unwrap(
      await adapter.crud.insert(
        COLLECTION,
        { _id: entryId, title: "live title", status: "draft" } as never,
        { tenantId: TENANT },
      ),
    );
    const draft = unwrap(
      await drafts.saveDraft(
        COLLECTION,
        {
          entryId,
          data: {
            title: "staged title",
            body: "staged body",
            status: "schedule",
            _scheduled: "2026-12-01T00:00:00.000Z",
          },
        },
        { user, tenantId: TENANT },
      ),
    );

    const promoted = unwrap(
      await drafts.promoteDraft(COLLECTION, String(draft._id), {
        user,
        tenantId: TENANT,
        status: StatusTypes.publish,
      }),
    ) as Record<string, unknown>;
    expect(promoted._id).toBe(entryId);

    const live = unwrap(
      await adapter.crud.findOne(COLLECTION, { _id: entryId } as never, { tenantId: TENANT }),
    ) as unknown as Record<string, unknown>;
    // The draft is the source of truth; the status override makes it publish
    // and drops a staged schedule timestamp.
    expect(live.title).toBe("staged title");
    expect(live.body).toBe("staged body");
    expect(live.status).toBe(StatusTypes.publish);
    expect(live._scheduled ?? null).toBeNull();
    expect(live).not.toHaveProperty("__draft");

    // Promotion went through the update lane, so the previous row was archived.
    const history = unwrap<PaginatedResult<ContentRevision>>(
      await adapter.content.revisions.getHistory(entryId as DatabaseId, {
        page: 1,
        pageSize: 10,
      }),
    );
    expect(history.items).toHaveLength(1);
    expect(revisionSnapshot(history.items[0] as unknown as Record<string, unknown>)?.title).toBe(
      "live title",
    );

    const remaining = unwrap(
      await drafts.getDraft(COLLECTION, entryId, { user, tenantId: TENANT }),
    );
    expect(remaining).toBeNull();
  });

  it("promotes a new-entry draft into a created live row", async () => {
    const draft = unwrap(
      await drafts.saveDraft(
        COLLECTION,
        { data: { title: "created from draft" } },
        { user, tenantId: TENANT },
      ),
    );

    const promoted = unwrap(
      await drafts.promoteDraft(COLLECTION, String(draft._id), {
        user,
        tenantId: TENANT,
        status: StatusTypes.publish,
      }),
    ) as Record<string, unknown>;
    expect(promoted._id).not.toBe(String(draft._id));
    expect(promoted._id).toBeTruthy();
    expect(promoted.title).toBe("created from draft");
    expect(promoted).not.toHaveProperty("__draft");
    expect(promoted.status).toBe(StatusTypes.publish);

    const remaining = unwrap(
      await drafts.getDraft(COLLECTION, undefined, { user, tenantId: TENANT }),
    );
    expect(remaining).toBeNull();
  });

  it("keeps the draft when the live write fails", async () => {
    const entryId = generateUUID();
    unwrap(
      await adapter.crud.insert(
        COLLECTION,
        { _id: entryId, title: "will vanish", status: "draft" } as never,
        { tenantId: TENANT },
      ),
    );
    const draft = unwrap(
      await drafts.saveDraft(
        COLLECTION,
        { entryId, data: { title: "retry me" } },
        { user, tenantId: TENANT },
      ),
    );
    // The live row disappears between staging and promotion: the UPDATE fails.
    unwrap(
      await adapter.crud.delete(COLLECTION, entryId as DatabaseId, {
        tenantId: TENANT,
        permanent: true,
      }),
    );

    const failed = await drafts.promoteDraft(COLLECTION, String(draft._id), {
      user,
      tenantId: TENANT,
      status: StatusTypes.publish,
    });
    expect(failed.success).toBe(false);

    const remaining = unwrap(
      await drafts.getDraft(COLLECTION, entryId, { user, tenantId: TENANT }),
    );
    expect(remaining?._id).toBe(draft._id);
  });

  it("refuses to promote another author's draft", async () => {
    const entryId = generateUUID();
    unwrap(
      await adapter.crud.insert(
        COLLECTION,
        { _id: entryId, title: "live only", status: "draft" } as never,
        { tenantId: TENANT },
      ),
    );
    const theirs = unwrap<ContentDraft>(
      await adapter.content.drafts.upsertDraft(
        {
          authorId: authorTwo._id as DatabaseId,
          collectionId: COLLECTION as DatabaseId,
          contentId: entryId as DatabaseId,
          data: { title: "their staged work" },
          tenantId: TENANT,
        },
        { tenantId: TENANT },
      ),
    );

    await expect(
      drafts.promoteDraft(COLLECTION, String(theirs._id), { user, tenantId: TENANT }),
    ).rejects.toMatchObject({ status: 404 });

    const live = unwrap(
      await adapter.crud.findOne(COLLECTION, { _id: entryId } as never, { tenantId: TENANT }),
    ) as unknown as Record<string, unknown>;
    expect(live.title).toBe("live only");

    const stillThere = unwrap<ContentDraft | null>(
      await adapter.content.drafts.getLatestForContent(entryId as DatabaseId, {
        tenantId: TENANT,
        authorId: authorTwo._id as DatabaseId,
      }),
    );
    expect(stillThere?._id).toBe(theirs._id);
  });
});
