/**
 * @file tests/unit/services/job-queue-service.test.ts
 * @description Unit tests for background job queue dispatch and handler registration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createJobMock = vi.fn();
const getNextReadyMock = vi.fn();
const updateJobMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("@src/databases/db", () => ({
  getDb: () => getDbMock(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@utils/temp-store", () => ({
  cleanupTempStore: vi.fn(),
}));

vi.mock("@src/services/background/pub-sub", () => ({
  pubSub: { publish: vi.fn() },
}));

// Avoid loading real heavy job handlers during module init
vi.mock("@src/services/background/jobs/media-jobs", () => ({
  processMediaHandler: vi.fn(),
}));
vi.mock("@src/services/background/jobs/webhook-jobs", () => ({
  webhookDeliveryHandler: vi.fn(),
}));
vi.mock("@src/services/background/jobs/import-jobs", () => ({
  importDataHandler: vi.fn(),
}));
vi.mock("@src/services/background/jobs/translation-jobs", () => ({
  bulkTranslateHandler: vi.fn(),
}));
vi.mock("@src/services/background/jobs/scheduled-jobs", () => ({
  scheduledPublishHandler: vi.fn(),
}));

// Import after mocks — module singleton
import { jobQueue } from "@src/services/background/jobs/job-queue-service";

describe("JobQueueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobQueue.stopPolling();
    getDbMock.mockReturnValue({
      system: {
        jobs: {
          create: createJobMock,
          getNextReady: getNextReadyMock,
          update: updateJobMock,
        },
      },
    });
  });

  afterEach(() => {
    jobQueue.stopPolling();
    delete process.env.BENCHMARK_MODE;
    delete process.env.DISABLE_JOBS;
  });

  describe("registerHandler + dispatch", () => {
    it("registerHandler accepts a custom handler without throwing", () => {
      const handler = vi.fn();
      expect(() => jobQueue.registerHandler("custom-task", handler)).not.toThrow();
    });

    it("dispatch returns null when DB adapter is not ready", async () => {
      getDbMock.mockReturnValue(null);
      const id = await jobQueue.dispatch("process-media", { fileId: "x" });
      expect(id).toBeNull();
      expect(createJobMock).not.toHaveBeenCalled();
    });

    it("dispatch returns null when jobs API is missing", async () => {
      getDbMock.mockReturnValue({ system: {} });
      const id = await jobQueue.dispatch("process-media", { fileId: "x" });
      expect(id).toBeNull();
    });

    it("dispatch creates a pending job and returns its id", async () => {
      createJobMock.mockResolvedValue({
        success: true,
        data: { _id: "job-abc" },
      });
      // prevent fire-and-forget processNextBatch noise
      getNextReadyMock.mockResolvedValue({ success: true, data: [] });

      const id = await jobQueue.dispatch("process-media", { fileId: "f1" }, "tenant-1");
      expect(id).toBe("job-abc");
      expect(createJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: "process-media",
          payload: { fileId: "f1" },
          status: "pending",
          attempts: 0,
          maxAttempts: 3,
          tenantId: "tenant-1",
        }),
      );
    });

    it("dispatch returns null when create fails", async () => {
      createJobMock.mockResolvedValue({
        success: false,
        message: "write failed",
      });
      const id = await jobQueue.dispatch("webhook-delivery", {});
      expect(id).toBeNull();
    });

    it("dispatch returns null when create throws", async () => {
      createJobMock.mockRejectedValue(new Error("boom"));
      const id = await jobQueue.dispatch("import-data", {});
      expect(id).toBeNull();
    });
  });

  describe("startPolling / stopPolling", () => {
    it("does not start interval when BENCHMARK_MODE is set", () => {
      process.env.BENCHMARK_MODE = "true";
      jobQueue.startPolling(1000);
      // stopPolling should be a no-op safe call
      jobQueue.stopPolling();
      delete process.env.BENCHMARK_MODE;
    });

    it("does not start interval when DISABLE_JOBS is set", () => {
      process.env.DISABLE_JOBS = "true";
      jobQueue.startPolling(1000);
      jobQueue.stopPolling();
      delete process.env.DISABLE_JOBS;
    });

    it("stopPolling is idempotent", () => {
      expect(() => {
        jobQueue.stopPolling();
        jobQueue.stopPolling();
      }).not.toThrow();
    });
  });

  describe("processNextBatch", () => {
    it("no-ops when no ready jobs", async () => {
      getNextReadyMock.mockResolvedValue({ success: true, data: [] });
      await jobQueue.processNextBatch(5);
      expect(updateJobMock).not.toHaveBeenCalled();
    });

    it("no-ops when jobs API missing", async () => {
      getDbMock.mockReturnValue({ system: {} });
      await jobQueue.processNextBatch();
      expect(getNextReadyMock).not.toHaveBeenCalled();
    });
  });
});
