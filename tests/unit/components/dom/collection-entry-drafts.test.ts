/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/collection-entry-drafts.test.ts
 * @description Draft/live separation at the route level: autosave writes a
 * draft, the resume banner applies one, and nothing creates a live entry.
 *
 * The fields editor is stubbed to the live form store (`@src/stores/collection-store`),
 * which is exactly what the real component edits, so these tests assert the
 * handoff between the drafts API, the banner and the form — the part that used
 * to call `createEntry`/`updateEntry` from the autosave path.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
// Import the mock modules directly: the Vitest aliases resolve to these exact
// files, so this is the same module instance the page sees at runtime — with
// types for the test-only navigation helpers.
import { page } from "../../mocks/$app/state";
import { __navigateForTest, __resetNavigationForTest } from "../../mocks/$app/navigation";
import { collections } from "@src/stores/collection-store.svelte";
import { validationStore } from "@src/stores/validation-store.svelte";
import type { Schema } from "@src/content/types";
import CollectionPage from "@src/routes/(app)/[language]/[...collection]/+page.svelte";
import { click, renderPage, settle, type RenderedComponent } from "./render";

const COLLECTION = "posts-collection-id";
const NOW = "2026-11-01T10:00:00.000Z";
const CREATE_URL = "http://localhost/en/posts?create=true";

const api = vi.hoisted(() => ({
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  getEntry: vi.fn(),
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
  discardDraftsForEntry: vi.fn(),
}));

// Partial mock: every other export (entry CRUD, cache invalidation) stays real
// so the page renders, while the draft lane is observable and the live-entry
// writers can be asserted "never called".
vi.mock("@utils/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@utils/api")>()),
  createEntry: api.createEntry,
  updateEntry: api.updateEntry,
  getEntry: api.getEntry,
  getDraft: api.getDraft,
  saveDraft: api.saveDraft,
  discardDraft: api.discardDraft,
  discardDraftsForEntry: api.discardDraftsForEntry,
}));

vi.mock(
  "@src/components/collection-display/fields.svelte",
  () => import("./mocks/mock-fields-view.svelte"),
);

// The real component fetches the workflow definition on mount; the editor tests
// do not exercise that lane and jsdom cannot resolve a relative `/api` URL.
vi.mock(
  "@src/components/collection-display/workflow-actions.svelte",
  () => import("./mocks/mock-workflow-actions.svelte"),
);

vi.mock("@src/stores/widget-store.svelte", () => ({
  widgets: { isLoaded: true, initialize: vi.fn(), loading: false, widgetFunctions: {} },
}));

const SCHEMA = {
  _id: COLLECTION,
  name: "posts",
  slug: "posts",
  path: "/posts",
  status: "unpublish",
  fields: [
    { db_fieldName: "title", label: "Title", required: true, widget: { Name: "Input" } },
    { db_fieldName: "slug", label: "Slug", required: true, widget: { Name: "Input" } },
  ],
  permissions: {},
} as unknown as Schema;

const DRAFT_ROW = {
  _id: "draft-1",
  contentId: "draft-own-uuid",
  collectionId: COLLECTION,
  authorId: "user-1",
  data: { title: { en: "Draft title" }, slug: { en: "draft-slug" }, __draft: { kind: "new" } },
  version: 1,
  status: "draft" as const,
  createdAt: NOW,
  updatedAt: NOW,
};

const RESUME = {
  draft: DRAFT_ROW,
  data: { title: { en: "Draft title" }, slug: { en: "draft-slug" } },
  isNewEntry: true,
};

function pageData(draftResume: unknown = null) {
  return {
    collectionSchema: SCHEMA,
    contentLanguage: "en",
    entries: [],
    pagination: { totalItems: 0, pagesCount: 1, currentPage: 1, pageSize: 10 },
    revisions: [],
    statusFacets: Promise.resolve({}),
    listMetrics: null,
    draftResume,
  };
}

let rendered: RenderedComponent | null = null;

afterEach(() => {
  // One editor is mounted at a time in the app; tests must not leave earlier
  // instances listening on `document` (each owns its own discard state).
  rendered?.cleanup();
  rendered = null;
});

function mountCreate(draftResume: unknown = null): RenderedComponent {
  rendered = renderPage(CollectionPage, pageData(draftResume));
  return rendered;
}

function formState(): Record<string, unknown> {
  return collections.activeValue ?? {};
}

beforeEach(() => {
  __resetNavigationForTest();
  api.createEntry.mockReset();
  api.updateEntry.mockReset();
  api.getEntry.mockReset();
  api.getDraft.mockReset();
  api.getDraft.mockResolvedValue({ success: true, data: null });
  api.saveDraft.mockReset();
  api.saveDraft.mockResolvedValue({ success: true, data: DRAFT_ROW });
  api.discardDraft.mockReset();
  api.discardDraft.mockResolvedValue({ success: true });
  api.discardDraftsForEntry.mockReset();
  api.discardDraftsForEntry.mockResolvedValue({ success: true });

  validationStore.clearAllErrors();
  collections.setCollection(SCHEMA);
  collections.setMode("view");
  collections.setCollectionValue({});
  page.url = new URL(CREATE_URL);
});

describe("entry editor — autosave writes a draft", () => {
  it("saves the form as a draft on leave and never touches the live entry", async () => {
    mountCreate();
    await settle();

    // What the user typed (the stubbed fields editor writes the same store).
    collections.setCollectionValue({
      title: { en: "Hello" },
      slug: { en: "hello" },
      status: "draft",
    });
    await settle();

    const proceeded = await __navigateForTest("http://localhost/en/posts");
    await settle();
    await settle();

    // The guard cancels the navigation while it stores the draft.
    expect(proceeded).toBe(false);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);

    const [collectionId, body] = api.saveDraft.mock.calls[0] as [
      string,
      { entryId?: string; data: Record<string, unknown> },
    ];
    expect(collectionId).toBe(COLLECTION);
    expect(body.entryId).toBeUndefined();
    expect(body.data.title).toEqual({ en: "Hello" });
    expect(body.data.__draft).toEqual({ kind: "new" });
    expect(Object.hasOwn(body.data, "_id")).toBe(false);

    // Regression: the live write lane is not the autosave sink any more.
    expect(api.createEntry).not.toHaveBeenCalled();
    expect(api.updateEntry).not.toHaveBeenCalled();
    // And no live id was stamped onto the new-entry form.
    expect(formState()._id).toBeUndefined();
  });

  it("writes nothing for an untouched Create form (M1 ghost-entry regression)", async () => {
    mountCreate();
    await settle();

    // Mount-time skeleton normalization: same content, different shape than
    // the snapshot the page took. It must not count as authored content.
    collections.setCollectionValue({ title: { en: "" }, slug: { en: "" }, status: "unpublish" });
    await settle();

    const proceeded = await __navigateForTest("http://localhost/en/posts");
    await settle();

    expect(proceeded).toBe(true);
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(api.createEntry).not.toHaveBeenCalled();
    expect(api.updateEntry).not.toHaveBeenCalled();
  });
});

describe("entry editor — resume offer", () => {
  it("shows the banner from the server read without applying anything", async () => {
    const { target } = mountCreate(RESUME);
    await settle();

    expect(target.querySelector('[data-testid="draft-resume-banner"]')).not.toBeNull();
    // The server loader already read this draft: no duplicate client fetch.
    expect(api.getDraft).not.toHaveBeenCalled();
    // A draft is an offer — the form still holds the empty skeleton.
    expect(formState().title).toBeNull();
    expect(formState()._id).toBeUndefined();
  });

  it("restores the draft into the form without creating an entry", async () => {
    const { target } = mountCreate(RESUME);
    await settle();

    await click(target.querySelector('[data-testid="draft-resume-restore"]'));

    expect(formState().title).toEqual({ en: "Draft title" });
    expect(formState().slug).toEqual({ en: "draft-slug" });
    expect(formState()._id).toBeUndefined();
    expect(target.querySelector('[data-testid="draft-resume-banner"]')).toBeNull();
    // Restoring is a local apply: no write of either kind.
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(api.createEntry).not.toHaveBeenCalled();
    expect(api.updateEntry).not.toHaveBeenCalled();
  });

  it("discards the draft and keeps the empty baseline when Discard is clicked", async () => {
    const { target } = mountCreate(RESUME);
    await settle();

    await click(target.querySelector('[data-testid="draft-resume-discard"]'));
    await settle();
    await settle();

    expect(api.discardDraft).toHaveBeenCalledWith(COLLECTION, "draft-1");
    expect(target.querySelector('[data-testid="draft-resume-banner"]')).toBeNull();
    // Discard is not Restore: the form is untouched.
    expect(formState().title).toBeNull();
    expect(api.discardDraftsForEntry).not.toHaveBeenCalled();
  });

  it("leaves an ordinary open unchanged when there is no draft", async () => {
    const { target } = mountCreate(null);
    await settle();

    expect(api.getDraft).toHaveBeenCalledTimes(1);
    expect(api.getDraft).toHaveBeenCalledWith(COLLECTION, undefined);
    expect(target.querySelector('[data-testid="draft-resume-banner"]')).toBeNull();
    expect(formState().title).toBeNull();
    expect(formState()._id).toBeUndefined();
  });
});

describe("entry editor — draft lifecycle after a commit", () => {
  it("discards a restored new-entry draft by its own id after the entry is created", async () => {
    const { target } = mountCreate(RESUME);
    await settle();
    await click(target.querySelector('[data-testid="draft-resume-restore"]'));

    // The new row's id names an entry the draft never belonged to.
    document.dispatchEvent(
      new CustomEvent("entrySaved", {
        bubbles: true,
        detail: { collectionId: COLLECTION, entryId: "entry-new" },
      }),
    );
    await settle();
    await settle();

    expect(api.discardDraft).toHaveBeenCalledWith(COLLECTION, "draft-1");
    expect(api.discardDraftsForEntry).not.toHaveBeenCalled();
  });

  it("clears every draft of an existing entry after it is saved", async () => {
    // Edit mode: the form is opened from the list row, the draft is read
    // client-side, and Save commits the same entry id.
    page.url = new URL("http://localhost/en/posts?edit=entry-1");
    api.getDraft.mockResolvedValue({
      success: true,
      data: {
        ...DRAFT_ROW,
        contentId: "entry-1",
        data: { title: { en: "Edited" }, slug: { en: "live" }, status: "publish" },
      },
    });

    const { target } = renderPage(CollectionPage, {
      ...pageData(null),
      entries: [{ _id: "entry-1", title: "Live title", status: "publish" }],
      pagination: { totalItems: 1, pagesCount: 1, currentPage: 1, pageSize: 10 },
    });
    await settle();
    await settle();

    expect(api.getDraft).toHaveBeenCalledWith(COLLECTION, "entry-1");
    expect(target.querySelector('[data-testid="draft-resume-banner"]')).not.toBeNull();

    await click(target.querySelector('[data-testid="draft-resume-restore"]'));
    // The restored form keeps the LIVE id — never the draft row's own id.
    expect(formState()._id).toBe("entry-1");
    expect(formState().title).toEqual({ en: "Edited" });

    document.dispatchEvent(
      new CustomEvent("entrySaved", {
        bubbles: true,
        detail: { collectionId: COLLECTION, entryId: "entry-1" },
      }),
    );
    await settle();
    await settle();

    expect(api.discardDraftsForEntry).toHaveBeenCalledWith(COLLECTION, "entry-1");
    expect(api.discardDraft).not.toHaveBeenCalled();
  });

  it("discards the authored draft once a save is reported", async () => {
    mountCreate();
    await settle();

    collections.setCollectionValue({
      title: { en: "Hello" },
      slug: { en: "hello" },
      status: "draft",
    });
    await settle();
    await __navigateForTest("http://localhost/en/posts");
    await settle();
    await settle();
    expect(api.saveDraft).toHaveBeenCalledTimes(1);

    // `saveEntry`/`cloneCurrentEntry` report a committed row through this event.
    document.dispatchEvent(
      new CustomEvent("entrySaved", {
        bubbles: true,
        detail: { collectionId: COLLECTION, entryId: "entry-new" },
      }),
    );
    await settle();
    await settle();

    // The draft was authored by a form without a live entry, so it is addressed
    // by its own id — the freshly created entry has no drafts yet.
    expect(api.discardDraft).toHaveBeenCalledWith(COLLECTION, "draft-1");

    // A repeated event must not delete again.
    document.dispatchEvent(
      new CustomEvent("entrySaved", {
        bubbles: true,
        detail: { collectionId: COLLECTION, entryId: "entry-new" },
      }),
    );
    await settle();
    expect(api.discardDraft).toHaveBeenCalledTimes(1);
  });
});
