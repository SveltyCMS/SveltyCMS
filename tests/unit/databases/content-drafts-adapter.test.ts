/**
 * @file tests/unit/databases/content-drafts-adapter.test.ts
 * @description Real-SQLite contract for the `content_drafts` storage lane
 * (draft/live separation, competitive bet #1).
 *
 * ### Features:
 * - new-entry drafts own their UUID (`_id === contentId`) and stay under one row
 * - upsert bumps `version`, keeps one row per (contentId, authorId), prunes at 20
 * - author + tenant scoping on reads and deletes
 * - `getLatestForCollection(..., { kind: "new" })` excludes entry drafts
 * - legacy rows (`collectionId` null) remain reachable by entry id
 * - `deleteForContent` removes only the scoped author's rows
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { ContentDraft, DatabaseId } from "@src/databases/db-interface";
import { DRAFT_RETENTION_LIMIT } from "@src/databases/core/relational-content";

const TENANT = "tenant-drafts" as DatabaseId;
const OTHER_TENANT = "tenant-other" as DatabaseId;
const COLLECTION = "drafts_contract" as DatabaseId;
const AUTHOR = "author-1" as DatabaseId;
const OTHER_AUTHOR = "author-2" as DatabaseId;

const draftData = (draft: ContentDraft | null) => draft?.data as Record<string, unknown>;

describe("content_drafts adapter contract (SQLite)", () => {
  let adapter: SQLiteAdapter;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    await (adapter as unknown as { provision: () => Promise<void> }).provision();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("uses the row's own id as contentId for a new unsaved entry", async () => {
    const saved = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        collectionId: COLLECTION,
        data: { title: "unsaved entry", __draft: { kind: "new" } },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );

    expect(saved.success, JSON.stringify(saved)).toBe(true);
    const draft = saved.success ? saved.data : null;
    expect(draft).not.toBeNull();
    expect(draft?.contentId).toBe(draft?._id);
    expect(draft?.collectionId).toBe(COLLECTION);
    expect(draft?.version).toBe(1);
    expect(draftData(draft).__draft).toEqual({ kind: "new" });
  });

  it("bumps version in place for the same author + content", async () => {
    const contentId = (
      await adapter.content.drafts.upsertDraft(
        {
          authorId: OTHER_AUTHOR,
          collectionId: COLLECTION,
          data: { title: "one" },
          tenantId: TENANT,
        },
        { tenantId: TENANT },
      )
    ).data?.contentId as DatabaseId;

    const second = await adapter.content.drafts.upsertDraft(
      { authorId: OTHER_AUTHOR, contentId, data: { title: "two" }, tenantId: TENANT },
      { tenantId: TENANT },
    );
    expect(second.success).toBe(true);
    expect(second.data?.version).toBe(2);

    const latest = await adapter.content.drafts.getLatestForContent(contentId, {
      tenantId: TENANT,
      authorId: OTHER_AUTHOR,
    });
    expect(latest.success).toBe(true);
    expect(latest.data?.version).toBe(2);
    expect(draftData(latest.data).title).toBe("two");

    const history = await adapter.content.drafts.getForContent(contentId, {
      tenantId: TENANT,
      authorId: OTHER_AUTHOR,
      pageSize: 50,
    });
    expect(history.success && history.data.items).toHaveLength(1);
  });

  it("prunes older draft rows beyond the retention window", async () => {
    const seeded = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        collectionId: COLLECTION,
        data: { title: "v1" },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );
    const contentId = seeded.data?.contentId as DatabaseId;

    // Seed an accumulated version history for the same author + entry, then let
    // one autosave prune everything outside the retention window.
    await adapter.content.drafts.createMany(
      Array.from({ length: DRAFT_RETENTION_LIMIT - 1 }, (_, index) => ({
        contentId,
        collectionId: COLLECTION,
        data: { title: `v${index + 2}` },
        version: index + 2,
        status: "draft" as const,
        authorId: AUTHOR,
        tenantId: TENANT,
      })) as never,
    );

    const saved = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        contentId,
        data: { title: "latest" },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );
    expect(saved.data?.version).toBe(DRAFT_RETENTION_LIMIT + 1);

    const history = await adapter.content.drafts.getForContent(contentId, {
      tenantId: TENANT,
      authorId: AUTHOR,
      pageSize: 50,
    });
    const versions = history.success
      ? history.data.items.map((row: ContentDraft) => row.version)
      : [];
    expect(versions.length).toBeLessThanOrEqual(DRAFT_RETENTION_LIMIT);
    expect(Math.max(...versions)).toBe(DRAFT_RETENTION_LIMIT + 1);
    // Everything older than the window is pruned; the newest versions remain.
    expect(versions).not.toContain(1);
    expect(Math.min(...versions)).toBeGreaterThan(1);
  });

  it("scopes reads and deletes by author", async () => {
    const shared = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        collectionId: COLLECTION,
        data: { title: "author one" },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );
    const contentId = shared.data?.contentId as DatabaseId;

    await adapter.content.drafts.upsertDraft(
      { authorId: OTHER_AUTHOR, contentId, data: { title: "author two" }, tenantId: TENANT },
      { tenantId: TENANT },
    );

    const mine = await adapter.content.drafts.getLatestForContent(contentId, {
      tenantId: TENANT,
      authorId: AUTHOR,
    });
    const theirs = await adapter.content.drafts.getLatestForContent(contentId, {
      tenantId: TENANT,
      authorId: OTHER_AUTHOR,
    });
    expect(draftData(mine.data).title).toBe("author one");
    expect(draftData(theirs.data).title).toBe("author two");

    const removed = await adapter.content.drafts.deleteForContent(contentId, {
      tenantId: TENANT,
      authorId: OTHER_AUTHOR,
    });
    expect(removed.success && removed.data.deletedCount).toBe(1);

    const remaining = await adapter.content.drafts.getForContent(contentId, {
      tenantId: TENANT,
      pageSize: 50,
    });
    expect(remaining.success && remaining.data.items).toHaveLength(1);
    expect(remaining.success && remaining.data.items[0].authorId).toBe(AUTHOR);
  });

  it("scopes reads by tenant", async () => {
    const saved = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        collectionId: COLLECTION,
        data: { title: "tenant one" },
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );
    const contentId = saved.data?.contentId as DatabaseId;

    // Same content + author in another tenant is a different draft row.
    const other = await adapter.content.drafts.upsertDraft(
      {
        authorId: AUTHOR,
        contentId,
        collectionId: COLLECTION,
        data: { title: "tenant two" },
        tenantId: OTHER_TENANT,
      },
      { tenantId: OTHER_TENANT },
    );
    expect(draftData(other.data).title).toBe("tenant two");

    const inTenant = await adapter.content.drafts.getLatestForContent(contentId, {
      tenantId: TENANT,
      authorId: AUTHOR,
    });
    expect(draftData(inTenant.data).title).toBe("tenant one");

    const removed = await adapter.content.drafts.deleteForContent(contentId, {
      tenantId: OTHER_TENANT,
    });
    expect(removed.success && removed.data.deletedCount).toBe(1);
    const stillThere = await adapter.content.drafts.getLatestForContent(contentId, {
      tenantId: TENANT,
      authorId: AUTHOR,
    });
    expect(stillThere.data?.contentId).toBe(contentId);
  });

  it("finds only new-entry drafts with kind: new", async () => {
    await adapter.content.drafts.upsertDraft(
      {
        authorId: OTHER_AUTHOR,
        collectionId: COLLECTION,
        data: { title: "entry draft" },
        contentId: "live-entry-1" as DatabaseId,
        tenantId: TENANT,
      },
      { tenantId: TENANT },
    );

    const newestNew = await adapter.content.drafts.getLatestForCollection(
      COLLECTION,
      OTHER_AUTHOR,
      { tenantId: TENANT, kind: "new" },
    );
    expect(newestNew.success).toBe(true);
    expect(newestNew.data?.contentId).toBe(newestNew.data?._id);
    expect(newestNew.data?.contentId).not.toBe("live-entry-1");

    const anyLatest = await adapter.content.drafts.getLatestForCollection(
      COLLECTION,
      OTHER_AUTHOR,
      { tenantId: TENANT },
    );
    expect(anyLatest.success).toBe(true);
    expect(anyLatest.data?.contentId).toBe("live-entry-1");
  });

  it("keeps legacy rows (collectionId null) reachable by entry id", async () => {
    const legacyEntryId = "legacy-entry-1" as DatabaseId;
    const inserted = await adapter.crud.insert<ContentDraft>(
      "content_drafts",
      {
        contentId: legacyEntryId,
        data: { title: "legacy" },
        version: 1,
        status: "draft",
        authorId: AUTHOR,
      } as never,
      { tenantId: TENANT },
    );
    expect(inserted.success).toBe(true);

    const byEntry = await adapter.content.drafts.getLatestForContent(legacyEntryId, {
      tenantId: TENANT,
      authorId: AUTHOR,
    });
    expect(byEntry.data?.contentId).toBe(legacyEntryId);
    expect(byEntry.data?.collectionId ?? null).toBeNull();

    const byCollection = await adapter.content.drafts.getLatestForCollection(COLLECTION, AUTHOR, {
      tenantId: TENANT,
    });
    expect(byCollection.success).toBe(true);
    expect(byCollection.data?.contentId).not.toBe(legacyEntryId);
  });
});
