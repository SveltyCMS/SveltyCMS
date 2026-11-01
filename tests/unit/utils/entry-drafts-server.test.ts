/**
 * @file tests/unit/utils/entry-drafts-server.test.ts
 * @description Server-side resume read (LocalCMS `drafts` namespace).
 *
 * The editor must not `fetch()` its own `/api` route during SSR, so the initial
 * resume read goes through `cms.drafts.getDraft`. A missing namespace or a
 * permission denial degrades to "no draft" — it must never break the entry page.
 */

import { describe, expect, it, vi } from "vitest";
import type { User } from "@src/databases/auth/types";
import { loadDraftResume } from "@utils/entry-drafts.server";

const NOW = "2026-11-01T10:00:00.000Z";
const COLLECTION = "posts-collection-id";
const ENTRY = "entry-1";
const USER = { _id: "user-1", role: "editor", username: "editor" } as unknown as User;

const DRAFT_ROW = {
  _id: "draft-1",
  contentId: ENTRY,
  collectionId: COLLECTION,
  authorId: "user-1",
  data: { _id: ENTRY, title: { en: "Draft title" } },
  version: 1,
  status: "draft" as const,
  createdAt: NOW,
  updatedAt: NOW,
};

function cmsWith(getDraft: (collectionId: string, entryId?: string, options?: unknown) => unknown) {
  return { drafts: { getDraft } };
}

const INPUT = {
  collectionId: COLLECTION,
  entryId: ENTRY,
  user: USER,
  tenantId: "global",
};

describe("loadDraftResume (server)", () => {
  it("reads through the SDK namespace with the request scope", async () => {
    const getDraft = vi.fn().mockResolvedValue({ success: true, data: DRAFT_ROW });

    const resume = await loadDraftResume(cmsWith(getDraft), INPUT);

    // `DatabaseResult` envelope from the namespace, author + tenant scoped.
    expect(getDraft).toHaveBeenCalledWith(COLLECTION, ENTRY, {
      user: USER,
      tenantId: "global",
    });
    expect(resume?.draft._id).toBe("draft-1");
    expect(resume?.data._id).toBe(ENTRY);
    expect(resume?.isNewEntry).toBe(false);
  });

  it("accepts a bare draft row (no result envelope)", async () => {
    const resume = await loadDraftResume(
      cmsWith(async () => DRAFT_ROW),
      INPUT,
    );

    expect(resume?.draft._id).toBe("draft-1");
  });

  it("answers null when the drafts lane is not available", async () => {
    // The locals facade may not expose the namespace yet, and a bare namespace
    // without the method is not a reader either.
    await expect(loadDraftResume({ collections: {} }, INPUT)).resolves.toBeNull();
    await expect(loadDraftResume(undefined, INPUT)).resolves.toBeNull();
    await expect(loadDraftResume({ drafts: { saveDraft: vi.fn() } }, INPUT)).resolves.toBeNull();
  });

  it("does not offer another entry's draft", async () => {
    const getDraft = vi.fn().mockResolvedValue({ success: true, data: DRAFT_ROW });

    await expect(
      loadDraftResume(cmsWith(getDraft), { ...INPUT, entryId: "entry-2" }),
    ).resolves.toBeNull();
  });

  it("offers a new-entry draft to a create form only when it is marked as new", async () => {
    const marked = vi.fn().mockResolvedValue({
      success: true,
      data: {
        ...DRAFT_ROW,
        contentId: "draft-own-uuid",
        data: { title: { en: "Half typed" }, __draft: { kind: "new" } },
      },
    });
    const resume = await loadDraftResume(cmsWith(marked), { ...INPUT, entryId: undefined });

    expect(marked).toHaveBeenCalledWith(COLLECTION, undefined, {
      user: USER,
      tenantId: "global",
    });
    expect(resume?.isNewEntry).toBe(true);
    expect(resume?.data).toEqual({ title: { en: "Half typed" } });

    // An edit draft must never be applied to a blank create form.
    const unmarked = vi.fn().mockResolvedValue({ success: true, data: DRAFT_ROW });
    await expect(
      loadDraftResume(cmsWith(unmarked), { ...INPUT, entryId: undefined }),
    ).resolves.toBeNull();
  });

  it("does not read without a collection, an entry-less list view or an anonymous user", async () => {
    const getDraft = vi.fn().mockResolvedValue({ success: true, data: DRAFT_ROW });

    await expect(
      loadDraftResume(cmsWith(getDraft), { ...INPUT, collectionId: "" }),
    ).resolves.toBeNull();
    await expect(loadDraftResume(cmsWith(getDraft), { ...INPUT, user: null })).resolves.toBeNull();
    expect(getDraft).not.toHaveBeenCalled();
  });

  it("degrades to null when the read throws (permission, adapter, SDK missing)", async () => {
    const getDraft = vi.fn().mockRejectedValue(new Error("FORBIDDEN"));

    await expect(loadDraftResume(cmsWith(getDraft), INPUT)).resolves.toBeNull();
  });
});
