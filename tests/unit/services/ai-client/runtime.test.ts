/**
 * @file tests/unit/services/ai-client/runtime.test.ts
 * @description Unit tests for the AI Client Worker manager and RPC bridge.
 *
 * Tests the non-Worker parts (timeouts, tree-shaking, error paths).
 * The Worker creation path is covered by E2E tests in a real browser.
 *
 * ### Test Strategy
 * - Unit tests cover fallback logic, timeout behavior, and tree-shaking safety
 * - E2E tests (in Playwright with a real browser) cover Worker creation + LiteRT.js
 * - jsdom does not support real Workers; we test the error path
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ─── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  // jsdom doesn't provide Worker — this is the SSR/browser-unsupported path
  // We test that the code handles this gracefully
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("AI Client Runtime", () => {
  describe("getWorker() — unsupported browser path", () => {
    it("throws a clear error when Worker is unsupported", async () => {
      // In jsdom, Worker is undefined — this simulates:
      // 1. SSR (Node.js runtime)
      // 2. Very old browsers
      // 3. CSP-blocked Worker creation
      const { getWorker } = await import("@src/services/ai-client/runtime");
      await expect(getWorker()).rejects.toThrow("Web Workers not supported");
    });

    it("isWorkerReady returns false when no Worker exists", async () => {
      const { isWorkerReady } = await import("@src/services/ai-client/runtime");
      expect(isWorkerReady()).toBe(false);
    });
  });

  describe("rpc() — request/response protocol", () => {
    it("rejects on timeout with a descriptive error", async () => {
      vi.useFakeTimers();

      // Create a minimal mock Worker that never responds
      const mockWorker = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        terminate: vi.fn(),
      } as unknown as Worker;

      const { rpc } = await import("@src/services/ai-client/runtime");
      const rpcPromise = rpc(mockWorker, { type: "ping", payload: undefined }, 100);

      vi.advanceTimersByTime(150);

      await expect(rpcPromise).rejects.toThrow("RPC timed out");
      vi.useRealTimers();
    });
  });

  describe("terminateWorker() — cleanup safety", () => {
    it("is safe to call when no Worker exists", async () => {
      const { terminateWorker, isWorkerReady } = await import("@src/services/ai-client/runtime");
      // Should not throw
      terminateWorker();
      expect(isWorkerReady()).toBe(false);
    });
  });

  describe("configuration API", () => {
    it("configureAiClient accepts options", async () => {
      const { configureAiClient } = await import("@src/services/ai-client");
      configureAiClient({ preferServerSide: true });
      // No crash — options stored internally
    });
  });

  describe("Tree-shaking safety (SSR)", () => {
    it("can be imported server-side without crashing", async () => {
      // Simulate SSR: Worker is undefined (jsdom default)
      const mod = await import("@src/services/ai-client");
      expect(mod.ai).toBeDefined();
      expect(mod.ai.isAvailable()).toBe(false);
    });

    it("generateAltText falls back to ollama when Worker unavailable", async () => {
      const mod = await import("@src/services/ai-client");
      // Worker is unavailable in jsdom — should fall back gracefully
      // The fallback will try to fetch Ollama (which won't be running)
      // but it should not throw — it should return a "failed" result
      const result = await mod.ai.generateAltText(new ArrayBuffer(8), "image/png");
      expect(result.backend).toBe("failed");
      expect(result.altText).toBe("");
      expect(typeof result.confidence).toBe("number");
    });
  });
});
