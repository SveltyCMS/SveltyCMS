/**
 * @file src/services/ai-client/runtime.ts
 * @description
 * LiteRT.js Worker Manager — singleton that owns the dedicated AI Web Worker
 * and provides a type-safe RPC bridge.
 *
 * ### Security Model
 * The AI Worker is created via Vite's native `new Worker(new URL(...), import.meta.url)`
 * pattern. This gives the Worker its own JavaScript execution context with:
 * - NO DOM access (cannot XSS the admin page)
 * - NO cookie / `localStorage` / `sessionStorage` access
 * - NO access to `window`, `document`, or admin page variables
 * - ONLY the postMessage bridge for typed RPC communication
 *
 * The admin page's Content-Security-Policy is never modified. If a future
 * CSP is added to admin pages, it would need `worker-src 'self'` and
 * `'wasm-unsafe-eval'` — both are security-neutral additions that only
 * explicitly permit what the Worker already does.
 *
 * ### Lifecycle
 * 1. First call to `getWorker()` creates the Worker and waits for "pong"
 * 2. Subsequent calls reuse the existing Worker synchronously
 * 3. Worker crash → auto-restart (up to 3 times)
 * 4. Unsupported browser → clear error, caller falls back to server-side Ollama
 *
 * @example
 *   ```typescript
 *   import { getWorker, rpc } from "./runtime";
 *   const worker = await getWorker();
 *   const res = await rpc(worker, { type: "ping", payload: undefined });
 *   // → { id: "ai-1", type: "pong", ok: true, data: { ready: true } }
 *   ```
 */

import type { AiWorkerRequest, AiWorkerResponse } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Timeout for a single RPC call (ms). */
const RPC_TIMEOUT_MS = 30_000;

/** Timeout for initial worker handshake (ms) — LiteRT.js loads ~15MB WASM. */
const HANDSHAKE_TIMEOUT_MS = 20_000;

/** Max consecutive Worker restarts before giving up. */
const MAX_RESTART_COUNT = 3;

// ─── State ──────────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let workerReady = false;
let workerPromise: Promise<Worker> | null = null;
let restartCount = 0;

// ─── RPC Bridge ─────────────────────────────────────────────────────────────

const pendingRequests = new Map<
  string,
  {
    resolve: (value: AiWorkerResponse) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let requestCounter = 0;

function nextId(): string {
  return `ai-${++requestCounter}-${Date.now().toString(36)}`;
}

/**
 * Send a typed RPC to the AI Worker and await the response.
 *
 * Each request gets a unique ID and timeout. If the worker doesn't respond
 * within the timeout, the promise rejects with a descriptive error so the
 * caller can fall back to the server-side Ollama path.
 */
export function rpc(
  workerInstance: Worker,
  req: Omit<AiWorkerRequest, "id">,
  timeoutMs: number = RPC_TIMEOUT_MS,
): Promise<AiWorkerResponse> {
  return new Promise<AiWorkerResponse>((resolve, reject) => {
    const id = nextId();
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(
        new Error(
          `[AI Client] RPC timed out after ${timeoutMs}ms (${req.type}). ` +
            `Falling back to server-side inference.`,
        ),
      );
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });

    workerInstance.postMessage({ ...req, id } satisfies AiWorkerRequest);
  });
}

/** Dispatch incoming Worker messages to the matching pending RPC callback. */
function handleMessage(event: MessageEvent<AiWorkerResponse>): void {
  const { id } = event.data;
  const pending = pendingRequests.get(id);
  if (!pending) return; // Stale response (e.g., from a prior worker instance)

  clearTimeout(pending.timer);
  pendingRequests.delete(id);
  pending.resolve(event.data);
}

/** Reject all in-flight requests with a worker error. */
function handleWorkerError(error: ErrorEvent): void {
  const errMsg = `[AI Client] Worker error: ${error.message || "unknown cause"}`;
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error(errMsg));
  }
  pendingRequests.clear();
}

// ─── Worker Lifecycle ───────────────────────────────────────────────────────

/**
 * Get (or lazily create) the AI Web Worker.
 *
 * **Fast path**: If the Worker is already alive and handshake-complete,
 * returns a synchronously resolved promise (zero wait).
 *
 * **Slow path**: On first call, creates the Worker, waits for the
 * LiteRT.js WASM runtime to load, and awaits the "pong" handshake.
 * If the handshake fails (unsupported browser, WASM download error),
 * rejects with a clear error that the caller should catch and fall
 * back to server-side Ollama.
 */
export function getWorker(): Promise<Worker> {
  if (worker && workerReady) {
    return Promise.resolve(worker);
  }

  if (workerPromise) {
    return workerPromise;
  }

  workerPromise = createWorker();
  return workerPromise;
}

async function createWorker(): Promise<Worker> {
  if (typeof Worker === "undefined") {
    throw new Error(
      "[AI Client] Web Workers not supported in this browser. " +
        "Use server-side fallback (Ollama) instead.",
    );
  }

  // Use Vite's native Worker import — Vite handles bundling the worker
  // as a separate chunk with its own module graph.
  const workerUrl = new URL("./ai.worker.ts", import.meta.url);
  worker = new Worker(workerUrl, {
    name: "svelty-ai-inference",
    type: "module",
  });

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleWorkerError);

  try {
    const response = await rpc(worker, { type: "ping", payload: undefined }, HANDSHAKE_TIMEOUT_MS);

    if (!response.ok || response.type !== "pong") {
      throw new Error(`Handshake failed: ${response.error || "unexpected response"}`);
    }

    workerReady = true;
    restartCount = 0;
    return worker;
  } catch (err) {
    terminateWorker();
    throw err;
  }
}

/**
 * Gracefully terminate the AI Worker and reset all state.
 *
 * All in-flight RPCs will reject with a clear "terminated" error.
 */
export function terminateWorker(): void {
  if (worker) {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleWorkerError);
    worker.terminate();
    worker = null;
  }
  workerReady = false;
  workerPromise = null;

  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error("[AI Client] Worker was terminated"));
  }
  pendingRequests.clear();
}

/**
 * Restart the AI Worker after a crash.
 *
 * Called automatically by the RPC bridge when a request fails. Gives up
 * after `MAX_RESTART_COUNT` consecutive restarts to avoid infinite loops.
 */
export function restartWorker(): Promise<Worker> {
  terminateWorker();
  restartCount++;

  if (restartCount > MAX_RESTART_COUNT) {
    restartCount = 0;
    return Promise.reject(
      new Error(
        `[AI Client] Worker crashed ${MAX_RESTART_COUNT} times consecutively. ` +
          "Not retrying. Use server-side Ollama fallback.",
      ),
    );
  }

  return getWorker();
}

/**
 * Check whether the Worker is currently alive and ready.
 */
export function isWorkerReady(): boolean {
  return worker !== null && workerReady;
}
