/**
 * @file tests/unit/utils/entry-drafts.test.ts
 * @description Draft/live separation, editor side: the autosave sink and the
 * resume offer.
 *
 * The regression these pin: autosave used to call `createEntry`/`updateEntry`,
 * so leaving a Create form wrote a live row and could stamp its `_id` onto the
 * form. The sink now writes a draft, and a draft can be applied without ever
 * creating an entry (M1).
 */

import { describe, expect, it, vi } from "vitest";
import { nowISODateString } from "@utils/date";
import type { ISODateString } from "@src/content/types";
import {
  asDraftRecord,
  buildDraftSaveBody,
  discardEntryDrafts,
  draftDiscardKey,
  draftFormData,
  draftResumeFor,
  draftResumeFromPayload,
  hasRestorableChanges,
  isNewEntryDraft,
  readDraftResume,
  saveEntryDraft,
} from "@utils/entry-drafts";
import type { ApiResponse, DraftRecord } from "@utils/api";

const NOW = nowISODateString() as ISODateString;
const COLLECTION = "posts-collection-id";
const ENTRY = "entry-1";

function makeDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    _id: "draft-1",
    contentId: ENTRY,
    collectionId: COLLECTION,
    authorId: "user-1",
    data: {
      _id: ENTRY,
      title: { en: "Draft title" },
      content: { en: "<p>Draft body</p>" },
      status: "publish",
    },
    version: 1,
    status: "draft",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** The response `saveDraft` answers with on success. */
function savedDraft(overrides: Partial<DraftRecord> = {}): ApiResponse<DraftRecord> {
  return { success: true, data: makeDraft(overrides) };
}

describe("buildDraftSaveBody", () => {
  it("links an existing entry by entryId and keeps the snapshot out of the id", () => {
    const body = buildDraftSaveBody({ _id: ENTRY, title: { en: "Edited" }, status: "publish" });

    expect(body.entryId).toBe(ENTRY);
    expect(body.data).toEqual({ title: { en: "Edited" }, status: "publish" });
    expect(Object.hasOwn(body.data, "_id")).toBe(false);
    expect(Object.hasOwn(body.data, "__draft")).toBe(false);
  });

  it("marks a new-entry draft and carries no entryId", () => {
    const form = { title: { en: "Hello" }, content: { en: "Body" }, status: "draft" };
    const body = buildDraftSaveBody(form);

    expect(body.entryId).toBeUndefined();
    expect(body.data.__draft).toEqual({ kind: "new" });
    expect(Object.hasOwn(body.data, "_id")).toBe(false);
    // The form is not mutated — autosave may run again on the same object.
    expect(Object.hasOwn(form, "_id")).toBe(false);
  });

  it("re-upserts the same new-entry draft under its contentId", () => {
    // Second autosave of a resumed new-entry session: the SDK's documented
    // resume path takes the draft's contentId as `entryId`, so one session keeps
    // one draft row.
    const body = buildDraftSaveBody(
      { title: { en: "Hello" }, status: "draft" },
      { draftEntryId: "draft-own-uuid" },
    );

    expect(body.entryId).toBe("draft-own-uuid");
    expect(body.data.__draft).toEqual({ kind: "new" });
    expect(Object.hasOwn(body.data, "_id")).toBe(false);
  });

  it("drops a marker left over from a resumed new-entry draft once the entry exists", () => {
    const body = buildDraftSaveBody({
      _id: ENTRY,
      title: { en: "Hello" },
      __draft: { kind: "new" },
    });

    expect(body.entryId).toBe(ENTRY);
    expect(Object.hasOwn(body.data, "__draft")).toBe(false);
  });
});

describe("asDraftRecord", () => {
  it("unwraps the API envelope and the bare SDK row", () => {
    const wrapped = asDraftRecord({ success: true, data: makeDraft() });
    const bare = asDraftRecord(makeDraft());

    expect(wrapped?._id).toBe("draft-1");
    expect(bare?._id).toBe("draft-1");
  });

  it("rejects anything that is not a draft row", () => {
    expect(asDraftRecord(null)).toBeNull();
    expect(asDraftRecord({ success: true, data: null })).toBeNull();
    expect(asDraftRecord({ _id: "draft-1" })).toBeNull();
    expect(asDraftRecord({ _id: "", data: {} })).toBeNull();
  });

  it("normalizes unknown status and missing stamps instead of throwing", () => {
    const draft = asDraftRecord({ _id: "draft-2", data: { title: "x" }, status: "weird" });

    expect(draft?.status).toBe("draft");
    expect(draft?.version).toBe(0);
    expect(draft?.updatedAt).toBe("");
  });
});

describe("resume offer", () => {
  it("offers an edit draft with the live entry id, never the draft's own", () => {
    const resume = draftResumeFor(makeDraft(), { entryId: ENTRY });

    expect(resume).not.toBeNull();
    expect(resume?.isNewEntry).toBe(false);
    expect(resume?.data._id).toBe(ENTRY);
    expect(resume?.data.title).toEqual({ en: "Draft title" });
  });

  it("refuses a draft written for a different entry", () => {
    expect(draftResumeFor(makeDraft(), { entryId: "entry-2" })).toBeNull();
  });

  it("applies a new-entry draft without an id", () => {
    const resume = draftResumeFromPayload(
      {
        success: true,
        data: makeDraft({
          contentId: "draft-own-uuid",
          data: { title: { en: "Half typed" }, __draft: { kind: "new" } },
        }),
      },
      {},
    );

    expect(resume?.isNewEntry).toBe(true);
    expect(resume?.data).toEqual({ title: { en: "Half typed" } });
    expect(Object.hasOwn(resume?.data ?? {}, "_id")).toBe(false);
  });

  it("refuses an unmarked draft on a new-entry form", () => {
    // Without the marker this could be someone's edit draft for another entry;
    // the contract has no "kind" filter, so the marker is the only guarantee.
    expect(draftResumeFromPayload(makeDraft(), {})).toBeNull();
    expect(isNewEntryDraft(makeDraft())).toBe(false);
  });

  it("never copies draft stamps into the form", () => {
    const data = draftFormData(
      makeDraft({ data: { _id: ENTRY, title: "x", createdAt: NOW, updatedAt: NOW } }),
      ENTRY,
    );

    expect(data).toEqual({ _id: ENTRY, title: "x" });
  });
});

describe("saveEntryDraft (autosave sink)", () => {
  it("writes only a draft — no create/update, no id on the form", async () => {
    const save = vi.fn().mockResolvedValue(savedDraft({ contentId: "draft-own-uuid" }));
    const form: Record<string, unknown> = { title: { en: "Hello" }, content: { en: "Body" } };

    const draft = await saveEntryDraft({
      collectionId: COLLECTION,
      entryData: form,
      save,
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(COLLECTION, {
      data: { title: { en: "Hello" }, content: { en: "Body" }, __draft: { kind: "new" } },
    });
    expect(draft?.contentId).toBe("draft-own-uuid");
    // M1: the form of a new entry keeps no live id after an autosave.
    expect(Object.hasOwn(form, "_id")).toBe(false);
  });

  it("reports failure without throwing when the endpoint rejects the write", async () => {
    const save = vi.fn().mockResolvedValue({ success: false, code: "FORBIDDEN", message: "no" });

    await expect(
      saveEntryDraft({ collectionId: COLLECTION, entryData: { title: "x" }, save }),
    ).resolves.toBeNull();
  });

  it("reports failure when the endpoint succeeds without a draft row", async () => {
    const save = vi.fn().mockResolvedValue({ success: true });

    await expect(
      saveEntryDraft({ collectionId: COLLECTION, entryData: { title: "x" }, save }),
    ).resolves.toBeNull();
  });

  it("survives a transport error", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      saveEntryDraft({ collectionId: COLLECTION, entryData: { title: "x" }, save }),
    ).resolves.toBeNull();
  });
});

describe("readDraftResume", () => {
  it("reads the draft of the entry being opened", async () => {
    const read = vi.fn().mockResolvedValue({ success: true, data: makeDraft() });

    const resume = await readDraftResume({ collectionId: COLLECTION, entryId: ENTRY, read });

    expect(read).toHaveBeenCalledWith(COLLECTION, ENTRY);
    expect(resume?.data._id).toBe(ENTRY);
  });

  it("returns nothing for an empty answer and does not throw on an error envelope", async () => {
    const empty = vi.fn().mockResolvedValue({ success: true, data: null });
    const denied = vi.fn().mockResolvedValue({ success: false, code: "FORBIDDEN" });

    await expect(
      readDraftResume({ collectionId: COLLECTION, entryId: ENTRY, read: empty }),
    ).resolves.toBeNull();
    await expect(
      readDraftResume({ collectionId: COLLECTION, entryId: ENTRY, read: denied }),
    ).resolves.toBeNull();
  });

  it("does not offer another entry's draft to a create form", async () => {
    const read = vi.fn().mockResolvedValue({ success: true, data: makeDraft() });

    await expect(readDraftResume({ collectionId: COLLECTION, read })).resolves.toBeNull();
  });
});

describe("discardEntryDrafts", () => {
  const discardOne = () => vi.fn().mockResolvedValue({ success: true });
  const discardAll = () => vi.fn().mockResolvedValue({ success: true });

  it("clears every draft of a live entry with one request", async () => {
    const one = discardOne();
    const all = discardAll();

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      entryId: ENTRY,
      draftId: "draft-1",
      discardOne: one,
      discardAll: all,
    });

    expect(outcome).toBe("discarded");
    expect(all).toHaveBeenCalledWith(COLLECTION, ENTRY);
    expect(one).not.toHaveBeenCalled();
  });

  it("deletes a new-entry draft by its own id", async () => {
    const one = discardOne();
    const all = discardAll();

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      entryId: null,
      draftId: "draft-1",
      discardOne: one,
      discardAll: all,
    });

    expect(outcome).toBe("discarded");
    expect(one).toHaveBeenCalledWith(COLLECTION, "draft-1");
    expect(all).not.toHaveBeenCalled();
  });

  it("does nothing when the form has no draft", async () => {
    const one = discardOne();
    const all = discardAll();

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      entryId: null,
      draftId: null,
      discardOne: one,
      discardAll: all,
    });

    expect(outcome).toBe("nothing");
    expect(one).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
  });

  it("treats an already-cleared draft (404) as discarded", async () => {
    // The backend may clear the draft on commit; the client delete then finds
    // nothing, which is the desired end state — not an error.
    const one = vi.fn().mockResolvedValue({ success: false, code: "HTTP_404" });

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      draftId: "draft-1",
      discardOne: one,
      discardAll: discardAll(),
    });

    expect(outcome).toBe("discarded");
  });

  it("reports a real failure so the banner can stay up", async () => {
    const one = vi.fn().mockResolvedValue({ success: false, code: "HTTP_500", message: "boom" });

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      draftId: "draft-1",
      discardOne: one,
      discardAll: discardAll(),
    });

    expect(outcome).toBe("failed");
  });

  it("survives a transport error", async () => {
    const one = vi.fn().mockRejectedValue(new Error("offline"));

    const outcome = await discardEntryDrafts({
      collectionId: COLLECTION,
      draftId: "draft-1",
      discardOne: one,
      discardAll: discardAll(),
    });

    expect(outcome).toBe("failed");
  });
});

describe("resume helpers", () => {
  it("counts a changed draft as worth offering", () => {
    const resume = draftResumeFor(makeDraft(), { entryId: ENTRY })!;
    const baseline = JSON.stringify({ _id: ENTRY, title: { en: "Live title" } });

    expect(hasRestorableChanges(resume, baseline)).toBe(true);
    expect(hasRestorableChanges(resume, JSON.stringify(resume.data))).toBe(false);
    expect(hasRestorableChanges(resume, "")).toBe(true);
    expect(hasRestorableChanges(resume, "{not json")).toBe(true);
  });

  it("collapses entry-wide and single-draft discards onto distinct keys", () => {
    expect(draftDiscardKey({ collectionId: COLLECTION, entryId: ENTRY, draftId: "d" })).toBe(
      `${COLLECTION}:entry:${ENTRY}`,
    );
    expect(draftDiscardKey({ collectionId: COLLECTION, draftId: "d" })).toBe(
      `${COLLECTION}:draft:d`,
    );
    expect(draftDiscardKey({ collectionId: COLLECTION })).toBe(`${COLLECTION}:draft:`);
  });
});
