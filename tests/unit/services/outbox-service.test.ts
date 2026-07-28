/**
 * @file tests/unit/services/outbox-service.test.ts
 * @description Unit tests for transactional outbox helpers and service logic.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock DB + pubSub before importing the service
// Use vi.hoisted to ensure variables are initialized before hoisted vi.mock calls
const {
  insertMock,
  findManyMock,
  updateMock,
  deleteManyMock,
  countMock,
  publishMock,
  webhookTriggerMock,
} = vi.hoisted(() => ({
  insertMock: vi.fn(),
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  deleteManyMock: vi.fn(),
  countMock: vi.fn(),
  publishMock: vi.fn(),
  webhookTriggerMock: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  getDb: () => ({
    crud: {
      insert: insertMock,
      findMany: findManyMock,
      update: updateMock,
      deleteMany: deleteManyMock,
      count: countMock,
    },
  }),
}));

vi.mock("@src/services/background/pub-sub", () => ({
  pubSub: { publish: publishMock },
}));

vi.mock("@src/services/background/webhook-service", () => ({
  webhookService: { trigger: webhookTriggerMock },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  isOutboxEventReady,
  outboxBackoffMs,
  outboxService,
  OUTBOX_MAX_ATTEMPTS,
  type OutboxEvent,
} from "@src/services/outbox/outbox-service";

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  const now = new Date().toISOString();
  return {
    _id: "evt-1",
    tenantId: "t1",
    eventType: "entry:create",
    aggregateType: "entry",
    aggregateId: "doc-1",
    payload: { hello: "world" },
    status: "pending",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    ...overrides,
  };
}

describe("outboxBackoffMs / isOutboxEventReady", () => {
  it("computes exponential backoff with cap", () => {
    expect(outboxBackoffMs(0)).toBe(0);
    expect(outboxBackoffMs(1)).toBe(1000);
    expect(outboxBackoffMs(2)).toBe(2000);
    expect(outboxBackoffMs(3)).toBe(4000);
    expect(outboxBackoffMs(20)).toBe(300_000); // capped
  });

  it("marks fresh events ready immediately", () => {
    expect(isOutboxEventReady(makeEvent({ attempts: 0 }))).toBe(true);
  });

  it("skips events still in backoff window", () => {
    const now = Date.now();
    const event = makeEvent({
      attempts: 2,
      updatedAt: new Date(now - 500).toISOString(), // 0.5s ago; need 2s
    });
    expect(isOutboxEventReady(event, now)).toBe(false);
  });

  it("allows events past backoff window", () => {
    const now = Date.now();
    const event = makeEvent({
      attempts: 1,
      updatedAt: new Date(now - 2000).toISOString(), // 2s ago; need 1s
    });
    expect(isOutboxEventReady(event, now)).toBe(true);
  });
});

describe("outboxService.emit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_OUTBOX;
    delete process.env.BENCHMARK_MODE;
  });

  it("inserts a pending event via crud", async () => {
    insertMock.mockResolvedValue({ success: true, data: makeEvent() });

    const result = await outboxService.emit(
      "entry:create",
      "entry",
      "doc-1",
      { title: "Hi" },
      "tenant-a",
    );

    expect(result.success).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [collection, row] = insertMock.mock.calls[0];
    expect(collection).toBe("svelty_outbox");
    expect(row.eventType).toBe("entry:create");
    expect(row.status).toBe("pending");
    expect(row.tenantId).toBe("tenant-a");
    expect(row.attempts).toBe(0);
  });

  it("passes transaction options through to insert", async () => {
    insertMock.mockResolvedValue({ success: true, data: makeEvent() });
    const tx = { db: {} };
    await outboxService.emit("entry:update", "entry", "x", {}, "t", {
      transaction: tx as any,
    });
    expect(insertMock.mock.calls[0][2]).toMatchObject({ transaction: tx });
  });

  it("skips when DISABLE_OUTBOX is set", async () => {
    process.env.DISABLE_OUTBOX = "true";
    const result = await outboxService.emit("entry:create", "entry", "x", {}, "t");
    expect(result.success).toBe(false);
    expect((result as any).error?.code).toBe("OUTBOX_DISABLED");
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("outboxService.processBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_OUTBOX;
    delete process.env.BENCHMARK_MODE;
    outboxService.stopPolling();
  });

  it("delivers ready events and marks delivered", async () => {
    const event = makeEvent({ attempts: 0 });
    findManyMock.mockResolvedValue({ success: true, data: [event] });
    publishMock.mockResolvedValue(undefined);
    webhookTriggerMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue({ success: true });

    const stats = await outboxService.processBatch(10);
    expect(stats.delivered).toBe(1);
    expect(stats.processed).toBe(1);
    expect(publishMock).toHaveBeenCalled();
    expect(webhookTriggerMock).toHaveBeenCalledWith("entry:create", event.payload, event.tenantId);
    expect(updateMock).toHaveBeenCalledWith(
      "svelty_outbox",
      event._id,
      expect.objectContaining({ status: "delivered" }),
    );
  });

  it("increments attempts and keeps pending on failure", async () => {
    const event = makeEvent({ attempts: 0 });
    findManyMock.mockResolvedValue({ success: true, data: [event] });
    publishMock.mockRejectedValue(new Error("boom"));
    updateMock.mockResolvedValue({ success: true });

    const stats = await outboxService.processBatch(10);
    expect(stats.failed).toBe(1);
    expect(updateMock).toHaveBeenCalledWith(
      "svelty_outbox",
      event._id,
      expect.objectContaining({
        status: "pending",
        attempts: 1,
        lastError: expect.stringContaining("boom"),
      }),
    );
  });

  it("marks permanently failed after max attempts", async () => {
    const event = makeEvent({ attempts: OUTBOX_MAX_ATTEMPTS - 1 });
    // Make it ready (past backoff)
    event.updatedAt = new Date(Date.now() - 600_000).toISOString();
    findManyMock.mockResolvedValue({ success: true, data: [event] });
    publishMock.mockRejectedValue(new Error("final"));
    updateMock.mockResolvedValue({ success: true });

    await outboxService.processBatch(10);
    expect(updateMock).toHaveBeenCalledWith(
      "svelty_outbox",
      event._id,
      expect.objectContaining({
        status: "failed",
        attempts: OUTBOX_MAX_ATTEMPTS,
      }),
    );
  });

  it("skips events still in backoff", async () => {
    const event = makeEvent({
      attempts: 3,
      updatedAt: new Date().toISOString(), // just failed
    });
    findManyMock.mockResolvedValue({ success: true, data: [event] });

    const stats = await outboxService.processBatch(10);
    expect(stats.processed).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe("outboxService.cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes old delivered events", async () => {
    deleteManyMock.mockResolvedValue({ success: true, data: { deletedCount: 3 } });
    const result = await outboxService.cleanup("2020-01-01T00:00:00.000Z");
    expect(result.success).toBe(true);
    expect(deleteManyMock).toHaveBeenCalledWith(
      "svelty_outbox",
      expect.objectContaining({ status: "delivered" }),
      expect.objectContaining({ permanent: true }),
    );
  });
});
