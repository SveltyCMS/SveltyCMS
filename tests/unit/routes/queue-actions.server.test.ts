/**
 * @file tests/unit/routes/queue-actions.server.test.ts
 * @description Unit tests for queue mutation actions (retry/delete/clear).
 * Auth is enforced in queue.remote (requireAdmin); these tests lock data-path validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const deleteMock = vi.fn();
const cleanupMock = vi.fn();

vi.mock("@src/databases/db", () => ({
  getDb: () => ({
    system: {
      jobs: {
        update: updateMock,
        delete: deleteMock,
        cleanup: cleanupMock,
      },
    },
  }),
}));

vi.mock("@utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  retryJob,
  deleteJob,
  clearCompleted,
} from "../../../src/routes/(app)/config/queue/queue-actions.server";

describe("queue-actions.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ success: true });
    deleteMock.mockResolvedValue({ success: true });
    cleanupMock.mockResolvedValue({ success: true, data: 3 });
  });

  describe("retryJob", () => {
    it("resets job to pending", async () => {
      const result = await retryJob("job-1");
      expect(result).toEqual({ success: true });
      expect(updateMock).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({ status: "pending", attempts: 0 }),
      );
    });

    it("throws 500 when adapter update fails", async () => {
      updateMock.mockResolvedValue({ success: false, message: "db down" });
      await expect(retryJob("job-1")).rejects.toMatchObject({ status: 500 });
    });
  });

  describe("deleteJob", () => {
    it("deletes job by id", async () => {
      const result = await deleteJob("job-2");
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalledWith("job-2");
    });

    it("throws 500 when delete fails", async () => {
      deleteMock.mockResolvedValue({ success: false, message: "missing" });
      await expect(deleteJob("x")).rejects.toMatchObject({ status: 500 });
    });
  });

  describe("clearCompleted", () => {
    it("returns cleaned count", async () => {
      const result = await clearCompleted();
      expect(result).toEqual({ success: true, count: 3 });
      expect(cleanupMock).toHaveBeenCalled();
    });
  });
});
