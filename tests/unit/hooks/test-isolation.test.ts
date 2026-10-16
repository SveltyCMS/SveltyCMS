/**
 * @file tests/unit/hooks/test-isolation.test.ts
 * @description Tests for handleTestIsolation middleware.
 *
 * Covers the hardened multi-tenant test worker isolation gate:
 * - TEST_MODE early return
 * - static / dotted-path short-circuit
 * - missing, malformed, non-loopback, and invalid-secret rejection paths
 * - the success path through AsyncLocalStorage into initWorkerConnection
 * - the fail-closed 503 when worker DB init rejects
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEvent, mockResolve } from "./test-utils";

// The master secret is resolved once per process and cached at module scope, so
// pin it before the first request. A real value also avoids relying on the
// e2e/.auth/test-secret.txt fixture that may or may not exist on a checkout.
process.env.TEST_API_SECRET = "unit-test-isolation-secret";

const dbControl = vi.hoisted(() => ({
  initWorkerConnection: vi.fn(async () => {}),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    get initWorkerConnection() {
      return dbControl.initWorkerConnection;
    },
  },
}));

import { handleTestIsolation } from "@src/hooks/handle-test-isolation";

function workerEvent(
  pathname = "/dashboard",
  extra: { index?: string; secret?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (extra.index !== undefined) headers["x-test-worker-index"] = extra.index;
  if (extra.secret !== undefined) headers["x-test-secret"] = extra.secret;
  return createMockEvent(pathname, { headers, ip: extra.ip });
}

describe("handleTestIsolation", () => {
  beforeEach(() => {
    mockResolve.mockClear();
    dbControl.initWorkerConnection = vi.fn(async () => {});
  });

  afterEach(() => vi.unstubAllEnvs());

  it("resolves immediately when TEST_MODE is not enabled", async () => {
    vi.stubEnv("TEST_MODE", "false");
    const event = workerEvent("/dashboard", { index: "1", secret: process.env.TEST_API_SECRET });

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("short-circuits dotted static asset paths", async () => {
    const event = workerEvent("/_app/immutable/chunks/main.js", {
      index: "1",
      secret: process.env.TEST_API_SECRET,
    });

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("proceeds without isolation when no worker index is present", async () => {
    const event = createMockEvent("/dashboard");

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("rejects a malformed worker index before any DB init", async () => {
    const event = workerEvent("/dashboard", { index: "abc", secret: process.env.TEST_API_SECRET });

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("blocks a non-loopback client address even with a valid secret", async () => {
    const event = workerEvent("/dashboard", {
      index: "7",
      secret: process.env.TEST_API_SECRET,
      ip: "10.0.0.5",
    });

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("treats a throwing getClientAddress as unresolved and blocks isolation", async () => {
    const event = workerEvent("/dashboard", { index: "4", secret: process.env.TEST_API_SECRET });
    (event as any).getClientAddress = () => {
      throw new Error("no address");
    };

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("blocks a mismatched test secret", async () => {
    const event = workerEvent("/dashboard", { index: "7", secret: "wrong-secret" });

    await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(dbControl.initWorkerConnection).not.toHaveBeenCalled();
  });

  it("runs the worker through testWorkerContext and resolves on success", async () => {
    const event = workerEvent("/dashboard", {
      index: "5",
      secret: process.env.TEST_API_SECRET,
    });

    const response = await handleTestIsolation({ event, resolve: mockResolve });

    expect(dbControl.initWorkerConnection).toHaveBeenCalledWith("5");
    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(response.status).toBe(200);
  });

  it("returns 503 fail-closed when worker DB init rejects", async () => {
    dbControl.initWorkerConnection = vi.fn(async () => {
      throw new Error("connection failed");
    });
    const event = workerEvent("/dashboard", {
      index: "9",
      secret: process.env.TEST_API_SECRET,
    });

    const response = await handleTestIsolation({ event, resolve: mockResolve });

    expect(response.status).toBe(503);
    expect(mockResolve).not.toHaveBeenCalled();
    const body = (await response.json()) as { error: string; worker: string };
    expect(body.error).toBe("Test worker isolation failed");
    expect(body.worker).toBe("9");
  });

  it("skips DB init when the adapter exposes no initWorkerConnection", async () => {
    dbControl.initWorkerConnection = undefined as unknown as typeof dbControl.initWorkerConnection;
    const event = workerEvent("/dashboard", {
      index: "3",
      secret: process.env.TEST_API_SECRET,
    });

    const response = await handleTestIsolation({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(response.status).toBe(200);
  });
});

describe("handleTestIsolation — master-secret resolution", () => {
  it("falls back to the shared e2e secret file when TEST_API_SECRET is unset", async () => {
    // Reload the module so resolveMasterSecret re-runs with a clean cache.
    vi.resetModules();
    dbControl.initWorkerConnection = vi.fn(async () => {});
    const original = process.env.TEST_API_SECRET;
    delete process.env.TEST_API_SECRET;
    try {
      const fresh = await import("@src/hooks/handle-test-isolation");
      const event = workerEvent("/dashboard", {
        index: "2",
        secret: "SVELTYCMS_TEST_SECRET_2026",
      });

      await fresh.handleTestIsolation({ event, resolve: mockResolve });

      expect(dbControl.initWorkerConnection).toHaveBeenCalledWith("2");
    } finally {
      if (original !== undefined) process.env.TEST_API_SECRET = original;
      vi.resetModules();
    }
  });
});
