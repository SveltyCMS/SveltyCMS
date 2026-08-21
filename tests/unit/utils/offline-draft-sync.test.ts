/**
 * @file tests/unit/utils/offline-draft-sync.test.ts
 * @description
 * Unit tests for OfflineDraftSync service.
 *
 * Verifies SvelteKit Remote Functions wrapping, optimistic UI execution,
 * offline draft queueing, automatic background sync replay, and local draft persistence.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OfflineDraftSync } from "@src/utils/offline-draft-sync";

describe("OfflineDraftSync (Remote Functions & Cellular Resilience)", () => {
  let sync: OfflineDraftSync;

  beforeEach(() => {
    sync = new OfflineDraftSync();
    sync.clearQueue();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("executes Remote Function directly when online", async () => {
    sync.setOnlineStatus(true);
    const mockRemoteFn = vi.fn().mockResolvedValue({ success: true });
    const optimisticUpdater = vi.fn();

    const wrapped = sync.wrapRemoteFunction("updateArticle", mockRemoteFn, optimisticUpdater);
    const result = await wrapped({ id: "article-1", title: "New Title" });

    expect(optimisticUpdater).toHaveBeenCalledWith({ id: "article-1", title: "New Title" });
    expect(mockRemoteFn).toHaveBeenCalledWith({ id: "article-1", title: "New Title" });
    expect(result).toEqual({ success: true });
  });

  it("handles offline status gracefully by enqueueing without throwing", async () => {
    sync.setOnlineStatus(false);
    const failingRemoteFn = vi.fn().mockRejectedValue(new Error("Network Error"));
    const optimisticUpdater = vi.fn();

    const wrapped = sync.wrapRemoteFunction("saveDraft", failingRemoteFn, optimisticUpdater);
    const result = await wrapped({ content: "Offline draft data" });

    expect(optimisticUpdater).toHaveBeenCalledWith({ content: "Offline draft data" });
    expect(result).toBeNull();
    expect(sync.pendingCount).toBe(1);
  });

  it("replays pending queue when connection is restored", async () => {
    sync.setOnlineStatus(false);
    const replayHandler = vi.fn().mockResolvedValue({ success: true });
    sync.registerHandler("publishPost", replayHandler);

    const wrapped = sync.wrapRemoteFunction("publishPost", replayHandler);
    await wrapped({ id: "post-123", status: "published" });

    expect(sync.pendingCount).toBe(1);
    expect(replayHandler).not.toHaveBeenCalled();

    sync.setOnlineStatus(true);
    const { synced, failed } = await sync.syncPendingQueue();

    expect(synced).toBe(1);
    expect(failed).toBe(0);
    expect(replayHandler).toHaveBeenCalledWith({ id: "post-123", status: "published" });
    expect(sync.pendingCount).toBe(0);
  });

  it("retries failed syncs up to MAX_SYNC_RETRIES before dropping", async () => {
    sync.setOnlineStatus(false);
    const flakeyHandler = vi.fn().mockRejectedValue(new Error("Cellular Timeout"));
    sync.registerHandler("submitForm", flakeyHandler);

    const wrapped = sync.wrapRemoteFunction("submitForm", flakeyHandler);
    await wrapped({ name: "Jane" });

    expect(sync.pendingCount).toBe(1);

    sync.setOnlineStatus(true);

    // Attempt 1
    const res1 = await sync.syncPendingQueue();
    expect(res1.failed).toBe(1);
    expect(sync.pendingCount).toBe(1);

    // Attempt 2
    const res2 = await sync.syncPendingQueue();
    expect(res2.failed).toBe(1);
    expect(sync.pendingCount).toBe(1);

    // Attempt 3 (reaches MAX_SYNC_RETRIES)
    const res3 = await sync.syncPendingQueue();
    expect(res3.failed).toBe(1);
    expect(sync.pendingCount).toBe(0); // Dropped after max retries
  });

  describe("Local Content Draft Helpers", () => {
    it("saves, retrieves, and clears local form drafts", () => {
      const data = { title: "My Draft Title", body: "Draft Content..." };
      sync.saveLocalDraft("articles", "entry-1", data, "tenant-a");

      expect(sync.hasLocalDraft("articles", "entry-1", "tenant-a")).toBe(true);
      expect(sync.hasLocalDraft("articles", "entry-2", "tenant-a")).toBe(false);

      const retrieved = sync.getLocalDraft("articles", "entry-1", "tenant-a");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.data).toEqual(data);
      expect(retrieved?.collection).toBe("articles");
      expect(retrieved?.entryId).toBe("entry-1");

      sync.clearLocalDraft("articles", "entry-1", "tenant-a");
      expect(sync.hasLocalDraft("articles", "entry-1", "tenant-a")).toBe(false);
      expect(sync.getLocalDraft("articles", "entry-1", "tenant-a")).toBeNull();
    });
  });
});
