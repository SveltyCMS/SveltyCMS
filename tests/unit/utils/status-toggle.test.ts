import { describe, it, expect, vi, beforeEach } from "vitest";
import { toggleEntryStatus, getInitialPublishStatus } from "@src/utils/status-toggle";

// Mock api-client
vi.mock("@src/utils/api", () => ({
  updateEntryStatus: vi.fn(),
}));

import { updateEntryStatus } from "@src/utils/api";

describe("Status Toggle Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("toggleEntryStatus", () => {
    it("should toggle from publish to unpublish for existing entry", async () => {
      const onSuccess = vi.fn();
      (updateEntryStatus as any).mockResolvedValue({ success: true });

      const result = await toggleEntryStatus({
        collectionId: "posts",
        entryId: "123",
        currentStatus: "publish",
        onSuccess,
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("unpublish");
      expect(updateEntryStatus).toHaveBeenCalledWith("posts", "123", "unpublish");
      expect(onSuccess).toHaveBeenCalledWith("unpublish");
    });

    it("should toggle from unpublish to publish", async () => {
      (updateEntryStatus as any).mockResolvedValue({ success: true });

      const result = await toggleEntryStatus({
        collectionId: "posts",
        entryId: "123",
        currentStatus: "unpublish",
      });

      expect(result.newStatus).toBe("publish");
      expect(updateEntryStatus).toHaveBeenCalledWith("posts", "123", "publish");
    });

    it("should handle API errors", async () => {
      const onError = vi.fn();
      (updateEntryStatus as any).mockResolvedValue({ success: false, error: "API Error" });

      const result = await toggleEntryStatus({
        collectionId: "posts",
        entryId: "123",
        currentStatus: "publish",
        onError,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API Error");
      expect(onError).toHaveBeenCalledWith("API Error");
    });

    it("should handle exceptions", async () => {
      (updateEntryStatus as any).mockRejectedValue(new Error("Network fail"));

      const result = await toggleEntryStatus({
        collectionId: "posts",
        entryId: "123",
        currentStatus: "publish",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Error unpublishing entry: Network fail");
    });

    it("should not call API for new entries (no entryId)", async () => {
      const onSuccess = vi.fn();
      const result = await toggleEntryStatus({
        collectionId: "posts",
        currentStatus: "publish",
        onSuccess,
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("unpublish");
      expect(updateEntryStatus).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("unpublish");
    });
  });

  describe("getInitialPublishStatus", () => {
    it("should return correct status for create mode", () => {
      expect(getInitialPublishStatus("create", "publish")).toBe(true);
      expect(getInitialPublishStatus("create", "unpublish")).toBe(false);
      expect(getInitialPublishStatus("create", undefined)).toBe(false);
    });

    it("should return correct status for edit mode", () => {
      // Entry status takes priority
      expect(getInitialPublishStatus("edit", "unpublish", "publish")).toBe(true);
      expect(getInitialPublishStatus("edit", "publish", "unpublish")).toBe(false);

      // Falls back to collection status
      expect(getInitialPublishStatus("edit", "publish", undefined)).toBe(true);

      // Falls back to default
      expect(getInitialPublishStatus("edit", undefined, undefined)).toBe(false);
    });
  });
});
