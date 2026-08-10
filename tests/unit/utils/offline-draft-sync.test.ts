/**
 * @file tests/unit/utils/offline-draft-sync.test.ts
 * @description
 * Unit tests for OfflineDraftSync service.
 *
 * Verifies SvelteKit 2 Remote Functions wrapping, optimistic UI execution, and offline draft queueing.
 */

import { describe, it, expect, vi } from "vitest";
import { OfflineDraftSync } from "@src/utils/offline-draft-sync";

describe("OfflineDraftSync (Remote Functions Optimistic Offline Proxy)", () => {
  it("executes Remote Function directly when online", async () => {
    const sync = new OfflineDraftSync();
    sync.setOnlineStatus(true);
    const mockRemoteFn = vi.fn().mockResolvedValue({ success: true });
    const optimisticUpdater = vi.fn();

    const wrapped = sync.wrapRemoteFunction("updateArticle", mockRemoteFn, optimisticUpdater);
    const result = await wrapped({ id: "article-1", title: "New Title" });

    expect(optimisticUpdater).toHaveBeenCalledWith({ id: "article-1", title: "New Title" });
    expect(mockRemoteFn).toHaveBeenCalledWith({ id: "article-1", title: "New Title" });
    expect(result).toEqual({ success: true });
  });

  it("handles offline status gracefully without throwing unhandled exceptions", async () => {
    const sync = new OfflineDraftSync();
    sync.setOnlineStatus(false);
    const failingRemoteFn = vi.fn().mockRejectedValue(new Error("Network Error"));
    const optimisticUpdater = vi.fn();

    const wrapped = sync.wrapRemoteFunction("saveDraft", failingRemoteFn, optimisticUpdater);
    const result = await wrapped({ content: "Offline draft data" });

    expect(optimisticUpdater).toHaveBeenCalled();
    expect(result).toBeNull();
    expect(sync.pendingCount).toBeGreaterThanOrEqual(1);
  });
});
