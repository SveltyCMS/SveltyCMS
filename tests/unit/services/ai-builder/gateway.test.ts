/**
 * @file tests/unit/services/ai-builder/gateway.test.ts
 * @description Unit tests for the model-backend gateway and quota tracking.
 *
 * ### Features covered:
 * - ordered backend failover (null → next, throw → next)
 * - structured-output contract (null on total failure)
 * - backend attribution via generateStructuredDetailed
 * - default singleton is Ollama-backed via aiService
 * - sliding-window quotas + RATE_LIMITED + resetQuotasForTests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import {
  BuilderAiGateway,
  builderAiGateway,
  type ModelBackend,
} from "@src/services/ai-builder/gateway";

// The default singleton lazily imports ai-service (Ollama). Mock it so tests
// never touch the network.
vi.mock("@src/services/core/ai-service", () => ({
  aiService: { generateJSON: vi.fn(), chat: vi.fn() },
}));
import { aiService } from "@src/services/core/ai-service";

function fakeBackend(name: string, result: unknown, throws = false): ModelBackend {
  return {
    name,
    generateStructured: vi.fn(async () => {
      if (throws) throw new Error(`${name} exploded`);
      return result;
    }),
  } as unknown as ModelBackend;
}

describe("BuilderAiGateway.generateStructured", () => {
  it("returns the first non-null result and skips remaining backends", async () => {
    const first = fakeBackend("first", { ok: true });
    const second = fakeBackend("second", { ok: false });
    const gateway = new BuilderAiGateway([first, second]);
    const result = await gateway.generateStructured<{ ok: boolean }>("prompt");
    expect(result).toEqual({ ok: true });
    expect(first.generateStructured).toHaveBeenCalledTimes(1);
    expect(second.generateStructured).not.toHaveBeenCalled();
  });

  it("fails over to the next backend when one returns null", async () => {
    const first = fakeBackend("first", null);
    const second = fakeBackend("second", { value: 42 });
    const gateway = new BuilderAiGateway([first, second]);
    expect(await gateway.generateStructured("prompt")).toEqual({ value: 42 });
    expect(first.generateStructured).toHaveBeenCalledTimes(1);
    expect(second.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("continues after a throwing backend", async () => {
    const first = fakeBackend("first", null, true);
    const second = fakeBackend("second", { ok: true });
    const gateway = new BuilderAiGateway([first, second]);
    expect(await gateway.generateStructured("prompt")).toEqual({ ok: true });
  });

  it("returns null when every backend fails", async () => {
    const gateway = new BuilderAiGateway([fakeBackend("a", null), fakeBackend("b", null, true)]);
    expect(await gateway.generateStructured("prompt")).toBeNull();
  });

  it("reports the producing backend via generateStructuredDetailed", async () => {
    const gateway = new BuilderAiGateway([fakeBackend("a", null), fakeBackend("b", { x: 1 })]);
    const detailed = await gateway.generateStructuredDetailed<{ x: number }>("prompt");
    expect(detailed).toEqual({ value: { x: 1 }, backend: "b" });
  });

  it("returns null from generateStructuredDetailed when every backend fails", async () => {
    const gateway = new BuilderAiGateway([fakeBackend("a", null)]);
    expect(await gateway.generateStructuredDetailed("prompt")).toBeNull();
  });

  it("default singleton is Ollama-backed via aiService", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValueOnce({ slug: "blog" });
    const detailed = await builderAiGateway.generateStructuredDetailed<{ slug: string }>("prompt");
    expect(detailed).toEqual({ value: { slug: "blog" }, backend: "ollama" });
  });

  it("default singleton returns null when aiService produces no JSON", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValueOnce(null);
    expect(await builderAiGateway.generateStructured("prompt")).toBeNull();
  });
});

describe("BuilderAiGateway.checkQuota", () => {
  afterEach(() => {
    BuilderAiGateway.resetQuotasForTests();
  });

  it("bypasses the quota for system and empty user ids", () => {
    const gateway = new BuilderAiGateway(undefined, { maxRequests: 1, windowMs: 60000 });
    expect(() => {
      gateway.checkQuota("system");
      gateway.checkQuota("system");
    }).not.toThrow();
    expect(() => {
      gateway.checkQuota("");
      gateway.checkQuota("");
    }).not.toThrow();
  });

  it("throws AppError 429 RATE_LIMITED when the window is exhausted", () => {
    const gateway = new BuilderAiGateway(undefined, { maxRequests: 2, windowMs: 60000 });
    gateway.checkQuota("user-1");
    gateway.checkQuota("user-1");
    let error: unknown;
    try {
      gateway.checkQuota("user-1");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.status).toBe(429);
    expect(appError.code).toBe("RATE_LIMITED");
  });

  it("counts quota per user independently", () => {
    const gateway = new BuilderAiGateway(undefined, { maxRequests: 1, windowMs: 60000 });
    gateway.checkQuota("user-a");
    expect(() => gateway.checkQuota("user-b")).not.toThrow();
  });

  it("slides the window: expired requests no longer count", () => {
    vi.useFakeTimers();
    try {
      const gateway = new BuilderAiGateway(undefined, { maxRequests: 2, windowMs: 1000 });
      gateway.checkQuota("user-2");
      gateway.checkQuota("user-2");
      expect(() => gateway.checkQuota("user-2")).toThrow(AppError);
      vi.advanceTimersByTime(1001);
      expect(() => gateway.checkQuota("user-2")).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resetQuotasForTests clears all live gateways", () => {
    const gateway = new BuilderAiGateway(undefined, { maxRequests: 1, windowMs: 60000 });
    gateway.checkQuota("user-3");
    expect(() => gateway.checkQuota("user-3")).toThrow(AppError);
    BuilderAiGateway.resetQuotasForTests();
    expect(() => gateway.checkQuota("user-3")).not.toThrow();
  });
});
