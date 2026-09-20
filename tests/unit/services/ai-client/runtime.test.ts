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

  // ─── Auto-restart / dispose lifecycle ───────────────────────────────────────
  describe("Worker crash auto-restart", () => {
    /** Minimal Worker boundary mock — responds to the ping handshake. */
    class FakeWorker {
      static instances: FakeWorker[] = [];
      static handshakeOk = true;

      #listeners = new Map<string, Set<(event: unknown) => void>>();

      static reset(): void {
        FakeWorker.instances = [];
        FakeWorker.handshakeOk = true;
      }

      constructor() {
        FakeWorker.instances.push(this);
      }

      addEventListener(type: string, listener: (event: unknown) => void): void {
        const set = this.#listeners.get(type) ?? new Set();
        set.add(listener);
        this.#listeners.set(type, set);
      }

      removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.#listeners.get(type)?.delete(listener);
      }

      postMessage(message: { id?: string; type?: string }): void {
        const id = message.id ?? "";
        const response = FakeWorker.handshakeOk
          ? { id, type: "pong", ok: true, data: { ready: true } }
          : { id, type: "error", ok: false, error: "boom" };
        queueMicrotask(() => this.fire("message", { data: response }));
      }

      terminate(): void {}

      fire(type: string, event: unknown): void {
        for (const listener of this.#listeners.get(type) ?? []) listener(event);
      }

      /** The crash listener registered by the runtime — captured before dispose. */
      getErrorListener(): ((event: unknown) => void) | undefined {
        return this.#listeners.get("error")?.values().next().value;
      }
    }

    const originalWorker = globalThis.Worker;

    beforeEach(() => {
      vi.resetModules();
      FakeWorker.reset();
      (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
    });

    afterEach(() => {
      (globalThis as unknown as { Worker: unknown }).Worker = originalWorker;
    });

    it("auto-restarts a crashed worker for the next request", async () => {
      const { getWorker, isWorkerReady, terminateWorker } =
        await import("@src/services/ai-client/runtime");

      await getWorker();
      expect(FakeWorker.instances.length).toBe(1);
      expect(isWorkerReady()).toBe(true);

      // Simulate an uncaught worker crash after a successful handshake.
      FakeWorker.instances[0].fire("error", { message: "crash" });

      await vi.waitFor(() => expect(FakeWorker.instances.length).toBe(2));
      await vi.waitFor(() => expect(isWorkerReady()).toBe(true));

      terminateWorker();
    });

    it("stops restarting at MAX_RESTART_COUNT when restarts keep failing", async () => {
      const { restartWorker } = await import("@src/services/ai-client/runtime");
      FakeWorker.handshakeOk = false;

      await expect(restartWorker()).rejects.toThrow("Handshake failed");
      await expect(restartWorker()).rejects.toThrow("Handshake failed");
      await expect(restartWorker()).rejects.toThrow("Handshake failed");
      // 4th consecutive failure exceeds the cap of 3 — no worker is created.
      await expect(restartWorker()).rejects.toThrow("crashed 3 times consecutively");
      expect(FakeWorker.instances.length).toBe(3);
    });

    it("does not restart after dispose", async () => {
      const { getWorker, restartWorker, terminateWorker } =
        await import("@src/services/ai-client/runtime");

      await getWorker();
      const crashed = FakeWorker.instances[0];
      const lateErrorListener = crashed.getErrorListener();

      terminateWorker();

      // A late error event from the disposed worker must not trigger a restart.
      lateErrorListener?.({ message: "late crash" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(FakeWorker.instances.length).toBe(1);

      // Explicit restarts are refused once disposed.
      await expect(restartWorker()).rejects.toThrow("disposed");
      expect(FakeWorker.instances.length).toBe(1);
    });
  });
});
