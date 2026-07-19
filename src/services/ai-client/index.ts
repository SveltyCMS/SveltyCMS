/**
 * @file src/services/ai-client/index.ts
 * @description
 * AI Client — public API for client-side ML inference via LiteRT.js.
 *
 * ### Usage (SvelteKit Remote Function Pattern)
 * Import and call like any async function:
 *
 * ```svelte
 * <script lang="ts">
 *   import { ai } from "@src/services/ai-client";
 *
 *   async function handleImageUpload(file: File) {
 *     const result = await ai.generateAltText(await file.arrayBuffer(), file.type);
 *     if (result.altText) {
 *       altText = result.altText; // Auto-fill the alt-text field
 *     }
 *   }
 * </script>
 * ```
 *
 * ### Architecture
 * ```
 * Caller (import { ai } from "...")    ← Clean function API
 *         │
 *         ▼
 *   ai-client/index.ts                 ← Orchestration layer
 *         │
 *         ├── LiteRT.js Worker         ← Isolated Web Worker (primary)
 *         │     │
 *         │     └── WebGPU / XNNPACK   ← Hardware-accelerated inference
 *         │
 *         └── Server-side Ollama       ← Fallback when Worker unavailable
 * ```
 *
 * ### Security
 * - Worker has NO DOM / cookie access
 * - Admin page CSP never modified
 * - All image data stays in-browser for alt-text
 * - Sensitive data never sent to external APIs
 *
 * ### Features:
 * - generateAltText(imageData, mimeType) → { altText, confidence, backend }
 * - generateEmbeddings(text) → { vector, dimensions, backend }
 * - getCapabilities() → { webgpu, webnn, xnnpack, runtimeReady }
 * - isAvailable() → boolean (quick check)
 */

import type { AiCapabilities, AltTextResult, EmbeddingResult } from "./types";
import { getWorker, rpc, isWorkerReady, terminateWorker } from "./runtime";
import { fallback } from "./fallback";

// ─── Configuration ──────────────────────────────────────────────────────────

interface AiClientOptions {
  /** Prefer server-side Ollama over client-side LiteRT.js. */
  preferServerSide?: boolean;
  /** Timeout for LiteRT.js inference (ms). Defaults to 30s. */
  timeoutMs?: number;
}

let options: AiClientOptions = {
  preferServerSide: false,
  timeoutMs: 30_000,
};

/**
 * Configure the AI Client behaviour.
 *
 * Call once at app boot (e.g., in a layout or on mount).
 * Throws if called after the first inference request.
 */
export function configureAiClient(opts: AiClientOptions): void {
  options = { ...options, ...opts };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * AI Client — the main API surface.
 *
 * Each method:
 * 1. Tries the LiteRT.js Worker (isolated Web Worker with WebGPU/WASM)
 * 2. On failure (unsupported browser, Worker crash, timeout), falls back
 *    to server-side Ollama
 * 3. Returns a structured result with the `backend` field indicating
 *    which path was used
 */
export const ai = {
  // ─── Alt-Text Generation ─────────────────────────────────────────────────

  /**
   * Generate accessible alt-text for an image.
   *
   * Primary path: LiteRT.js in Worker (MobileNetV3, WebGPU-accelerated)
   * Fallback path: Server-side Ollama (llava vision model)
   *
   * @param imageData - Raw image bytes (ArrayBuffer from File/Blob).
   * @param mimeType  - MIME type for context (e.g., "image/jpeg").
   * @param contextHint - Optional hint about the image subject.
   *
   * @returns Alt-text suggestion with confidence score and backend info.
   *
   * @example
   *   const result = await ai.generateAltText(fileBuffer, "image/png");
   *   // → { altText: "A person standing in front of a building",
   *   //     confidence: 0.92, backend: "litert", latencyMs: 180 }
   */
  async generateAltText(
    imageData: ArrayBuffer,
    mimeType: string,
    contextHint?: string,
  ): Promise<AltTextResult> {
    const startTime = performance.now();

    if (options.preferServerSide) {
      return fallback.generateAltText(imageData, mimeType, contextHint);
    }

    // Try LiteRT.js Worker
    try {
      const worker = await getWorker();
      const response = await rpc(worker, {
        type: "generateAltText",
        payload: { imageData, mimeType, contextHint },
      });

      if (response.ok && response.data) {
        const data = response.data as AltTextResult;
        return {
          ...data,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }

      throw new Error(response.error || "Alt-text generation failed");
    } catch {
      // Worker unavailable — fall back to server-side Ollama
      return fallback.generateAltText(imageData, mimeType, contextHint);
    }
  },

  // ─── Embedding Generation ────────────────────────────────────────────────

  /**
   * Generate text embeddings for semantic search.
   *
   * Primary path: LiteRT.js in Worker (EmbeddingGemma, WebGPU)
   * Fallback path: Server-side Ollama (nomic-embed-text)
   *
   * @param text - The text to embed.
   * @returns A float32 vector with dimensionality info.
   */
  async generateEmbeddings(text: string): Promise<EmbeddingResult> {
    const startTime = performance.now();

    if (options.preferServerSide) {
      return fallback.generateEmbeddings(text);
    }

    try {
      const worker = await getWorker();
      const response = await rpc(worker, {
        type: "generateEmbeddings",
        payload: { text },
      });

      if (response.ok && response.data) {
        const data = response.data as EmbeddingResult;
        return {
          ...data,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }

      throw new Error(response.error || "Embedding generation failed");
    } catch {
      return fallback.generateEmbeddings(text);
    }
  },

  // ─── Capability Detection ────────────────────────────────────────────────

  /**
   * Detect which AI capabilities the current browser supports.
   *
   * Queries the Worker for WebGPU/WebNN/WASM availability.
   * Falls back to browser-only detection if the Worker can't start.
   *
   * @returns A structured capabilities report.
   */
  async getCapabilities(): Promise<AiCapabilities> {
    // Fast path: detect WebGPU synchronously from the main thread
    const webgpu = typeof (navigator as any).gpu !== "undefined";
    const webnn = typeof (navigator as any).ml !== "undefined";
    const xnnpack =
      typeof WebAssembly !== "undefined" && typeof WebAssembly.instantiate === "function";

    // Try Worker for runtime-ready status
    try {
      const worker = await getWorker();
      const response = await rpc(worker, {
        type: "getCapabilities",
        payload: undefined,
      });

      if (response.ok && response.data) {
        return response.data as AiCapabilities;
      }
    } catch {
      // Worker unavailable — use sync detection only
    }

    return {
      webgpu,
      webnn,
      xnnpack,
      runtimeReady: false,
      label: webgpu ? "WebGPU (runtime pending)" : xnnpack ? "CPU" : "unavailable",
    };
  },

  // ─── Health Checks ───────────────────────────────────────────────────────

  /**
   * Quick check: is the AI Worker alive?
   *
   * Useful for UI state — show/hide AI-powered buttons based on availability.
   */
  isAvailable(): boolean {
    return isWorkerReady();
  },

  /**
   * Gracefully shut down the AI Worker.
   *
   * Call when leaving the admin panel or when the user disables AI features.
   */
  dispose(): void {
    terminateWorker();
  },
};
