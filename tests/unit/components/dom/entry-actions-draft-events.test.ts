/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-actions-draft-events.test.ts
 * @description The commit → discard handoff for draft/live separation.
 *
 * `entry-actions` owns the Save/Publish (and Delete) writes. The editor cannot
 * poll for "did the live row change", so each successful commit reports itself
 * on `document` and the editor discards the draft behind the form it committed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  batchDeleteEntries: vi.fn(),
  batchUpdateEntries: vi.fn(),
  createClones: vi.fn(),
  createEntry: vi.fn(),
  deleteEntry: vi.fn(),
  invalidateCollectionCache: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryStatus: vi.fn(),
}));

vi.mock("@src/utils/api", () => api);

vi.mock("@src/stores/collection-store.svelte.ts", () => ({
  collections: {
    active: { _id: "posts-collection-id", status: "draft" },
    activeValue: { _id: "entry-1" },
    mode: "edit",
    resetChanges: vi.fn(),
  },
  setCollectionValue: vi.fn(),
  setMode: vi.fn(),
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: { USE_ARCHIVE_ON_DELETE: true },
}));

vi.mock("@utils/modal.svelte", () => ({
  showCloneModal: vi.fn(),
  showConfirm: vi.fn(),
  DEFAULT_THEMES: { delete: {}, archive: {} },
}));

vi.mock("@utils/navigation", () => ({
  navigationManager: {
    toList: vi.fn().mockResolvedValue(undefined),
    toEdit: vi.fn(),
    toView: vi.fn(),
  },
}));

import { deleteCurrentEntry, saveEntry } from "@src/utils/entry-actions";
import { showConfirm } from "@utils/modal.svelte";

interface DraftEventDetail {
  collectionId?: string;
  entryId?: string;
}

/** Capture the commit events the editor listens for. */
function collectEvents(name: "entrySaved" | "entryDeleted"): DraftEventDetail[] {
  const seen: DraftEventDetail[] = [];
  document.addEventListener(name, (event) => {
    seen.push((event as CustomEvent<DraftEventDetail>).detail ?? {});
  });
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createEntry.mockResolvedValue({
    success: true,
    data: { _id: "entry-new", title: "Hello" },
  });
  api.updateEntry.mockResolvedValue({
    success: true,
    data: { _id: "entry-1", title: "Hello" },
  });
  api.deleteEntry.mockResolvedValue({ success: true });
});

describe("entry-actions — commit events", () => {
  it("reports a saved new entry so the editor can drop its draft", async () => {
    const saved = collectEvents("entrySaved");

    await expect(saveEntry({ title: "Hello", status: "draft" })).resolves.toBe(true);

    expect(api.createEntry).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([{ collectionId: "posts-collection-id", entryId: "entry-new" }]);
  });

  it("reports an updated entry with the id it was saved under", async () => {
    const saved = collectEvents("entrySaved");

    await expect(saveEntry({ _id: "entry-1", title: "Hello", status: "publish" })).resolves.toBe(
      true,
    );

    expect(api.updateEntry).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([{ collectionId: "posts-collection-id", entryId: "entry-1" }]);
  });

  it("reports nothing when the write fails", async () => {
    api.updateEntry.mockResolvedValue({ success: false, error: "nope" });
    const saved = collectEvents("entrySaved");

    await expect(saveEntry({ _id: "entry-1", title: "Hello" })).resolves.toBe(false);

    expect(saved).toHaveLength(0);
  });

  it("reports a deleted entry so its drafts do not outlive it", async () => {
    const deleted = collectEvents("entryDeleted");

    deleteCurrentEntry(true);
    const confirm = vi.mocked(showConfirm).mock.calls.at(-1)?.[0] as
      | { onConfirm: () => Promise<void> }
      | undefined;
    expect(confirm).toBeDefined();
    await confirm?.onConfirm();

    expect(api.deleteEntry).toHaveBeenCalledWith("posts-collection-id", "entry-1", {
      permanent: false,
    });
    expect(deleted).toEqual([{ collectionId: "posts-collection-id", entryId: "entry-1" }]);
  });
});
