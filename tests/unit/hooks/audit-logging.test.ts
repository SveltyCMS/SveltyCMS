/**
 * @file tests/unit/hooks/audit-logging.test.ts
 * @description Unit tests for the mutation audit logging hook.
 *
 * ### Features:
 * - `recordAuditEntry` happy path (success entry) and error path
 * - `handleAuditLogging` middleware success + thrown-error status extraction
 * - Fast exits: non-API paths, read-only methods, test bypass, env disable
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { recordAuditEntry, handleAuditLogging } from "@src/hooks/handle-audit-logging";
import { createMockEvent, mockResolve } from "./test-utils";
import { logger } from "@utils/logger";
import { rollingMerkleAccumulator } from "@src/services/security/rolling-merkle";
import { AppError } from "@utils/error-handling";

const ORIGINAL_TEST_MODE = process.env.TEST_MODE;
const ORIGINAL_DISABLE_AUDIT = process.env.DISABLE_AUDIT_LOGS;

/** Drains the queueMicrotask scheduled by `flushAuditOutbox`. */
async function flushAuditOutboxMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = ORIGINAL_TEST_MODE;

  if (ORIGINAL_DISABLE_AUDIT === undefined) delete process.env.DISABLE_AUDIT_LOGS;
  else process.env.DISABLE_AUDIT_LOGS = ORIGINAL_DISABLE_AUDIT;

  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("recordAuditEntry", () => {
  it("records a successful mutation into the outbox and appends a merkle leaf", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    recordAuditEntry(event, 201, "1.2");
    await flushAuditOutboxMicrotasks();

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const hashes = appendSpy.mock.calls[0]![0] as string[];
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^POST:\/api\/collections\/Articles:anonymous:/);
  });

  it("records a failed mutation with the execution error message", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", {
      method: "POST",
      user: { _id: "user-1", role: "editor" },
    });
    recordAuditEntry(event, 500, "3.4", new Error("write failed"));
    await flushAuditOutboxMicrotasks();

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const hashes = appendSpy.mock.calls[0]![0] as string[];
    expect(hashes[0]).toMatch(/^POST:\/api\/collections\/Articles:user-1:/);

    const warnCalls = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const auditWarn = warnCalls.find(
      (call) => call[0] === "[AUDIT] Mutation logged with failure flags",
    );
    expect(auditWarn).toBeTruthy();
    const logEntry = auditWarn![1] as Record<string, unknown>;
    expect(logEntry.status).toBe(500);
    expect(logEntry.success).toBe(false);
    expect(logEntry.error).toEqual({ message: "write failed" });
  });

  it("stringifies a non-Error execution error as the message", async () => {
    process.env.TEST_MODE = "false";
    vi.spyOn(rollingMerkleAccumulator, "appendLeaves").mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    recordAuditEntry(event, 400, "1.0", "raw failure");
    await flushAuditOutboxMicrotasks();

    const warnCalls = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const auditWarn = warnCalls.find(
      (call) => call[0] === "[AUDIT] Mutation logged with failure flags",
    );
    expect(auditWarn).toBeTruthy();
    expect((auditWarn![1] as Record<string, unknown>).error).toEqual({ message: "raw failure" });
  });

  it("returns early when locals.__testBypass is set", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    (event.locals as unknown as Record<string, unknown>).__testBypass = true;
    recordAuditEntry(event, 200, "1.0");
    await flushAuditOutboxMicrotasks();

    expect(appendSpy).not.toHaveBeenCalled();
  });

  it("returns early when audit logging is disabled by env", async () => {
    process.env.TEST_MODE = "false";
    process.env.DISABLE_AUDIT_LOGS = "true";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    recordAuditEntry(event, 200, "1.0");
    await flushAuditOutboxMicrotasks();

    expect(appendSpy).not.toHaveBeenCalled();
  });
});

describe("handleAuditLogging", () => {
  it("passes through non-API paths without recording", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/dashboard", { method: "POST" });
    const resolve = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    const res = await handleAuditLogging({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(res.status).toBe(200);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it("passes through read-only API methods without recording", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "GET" });
    const resolve = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await handleAuditLogging({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it("records and returns a successful mutation response", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    const res = await handleAuditLogging({ event, resolve: mockResolve });

    expect(res.status).toBe(200);
    await flushAuditOutboxMicrotasks();
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  it("extracts the thrown error status and rethrows", async () => {
    process.env.TEST_MODE = "false";
    const appendSpy = vi
      .spyOn(rollingMerkleAccumulator, "appendLeaves")
      .mockResolvedValue("root-hash");

    const event = createMockEvent("/api/collections/Articles", { method: "PATCH" });
    const boom = new AppError("Forbidden", 403, "FORBIDDEN");
    const resolve = vi.fn().mockRejectedValue(boom);

    await expect(handleAuditLogging({ event, resolve })).rejects.toBe(boom);

    await flushAuditOutboxMicrotasks();
    expect(appendSpy).toHaveBeenCalledTimes(1);

    const warnCalls = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const auditWarn = warnCalls.find(
      (call) => call[0] === "[AUDIT] Mutation logged with failure flags",
    );
    expect(auditWarn).toBeTruthy();
    const logEntry = auditWarn![1] as Record<string, unknown>;
    expect(logEntry.status).toBe(403);
    expect(logEntry.success).toBe(false);
  });

  it("defaults to 500 for a thrown error without a status", async () => {
    process.env.TEST_MODE = "false";

    const event = createMockEvent("/api/collections/Articles", { method: "POST" });
    const boom = new Error("boom");
    const resolve = vi.fn().mockRejectedValue(boom);

    await expect(handleAuditLogging({ event, resolve })).rejects.toBe(boom);

    await flushAuditOutboxMicrotasks();
    const warnCalls = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const auditWarn = warnCalls.find(
      (call) => call[0] === "[AUDIT] Mutation logged with failure flags",
    );
    expect(auditWarn).toBeTruthy();
    expect((auditWarn![1] as Record<string, unknown>).status).toBe(500);
  });
});
