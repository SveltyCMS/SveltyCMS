/**
 * @file src/services/ai-client/types.ts
 * @description
 * Type definitions for the AI Client service — a privacy-first, CSP-safe
 * LiteRT.js inference engine isolated in a dedicated Web Worker.
 *
 * The worker is served from /ai/worker with its own relaxed CSP, leaving
 * the admin page's security headers untouched.
 *
 * ### Features:
 * - typed RPC protocol (request/response discriminators)
 * - model configuration metadata
 * - capability reports from the worker
 * - fallback configuration
 */

// ─── RPC Protocol ───────────────────────────────────────────────────────────

/** Discriminated RPC request sent from the admin page to the AI Worker. */
export interface AiWorkerRequest {
  id: string;
  type: "ping" | "generateAltText" | "generateEmbeddings" | "loadModel" | "getCapabilities";
  /** Payload bytes or text, depending on type. */
  payload?: unknown;
}

/** Discriminated RPC response sent from the AI Worker back to the admin page. */
export interface AiWorkerResponse {
  id: string;
  type: "pong" | "altText" | "embeddings" | "modelLoaded" | "capabilities" | "error";
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ─── Model Registry ─────────────────────────────────────────────────────────

export interface ModelInfo {
  /** Unique model identifier (maps to a .tflite file on the CDN). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Approximate download size in MB. */
  sizeMb: number;
  /** Preferred accelerator. Falls back to CPU when unavailable. */
  accelerator: "webgpu" | "xnnpack" | "webnn";
  /** Whether the model has been downloaded and compiled. */
  loaded: boolean;
}

/** Registry of models the AI Client knows how to load and run. */
export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: "mobilenet-v3-256",
    name: "MobileNetV3 (256px)",
    sizeMb: 4.5,
    accelerator: "webgpu",
    loaded: false,
  },
  {
    id: "embedding-gemma-384",
    name: "EmbeddingGemma (384d)",
    sizeMb: 18,
    accelerator: "webgpu",
    loaded: false,
  },
];

// ─── Capability Report ──────────────────────────────────────────────────────

/** What the client browser + environment supports. */
export interface AiCapabilities {
  /** WebGPU is available (primary path). */
  webgpu: boolean;
  /** WASM + XNNPACK CPU path is available (fallback). */
  xnnpack: boolean;
  /** WebNN (NPU) is available (experimental — Chrome/Edge only). */
  webnn: boolean;
  /** LiteRT.js WASM runtime loaded successfully. */
  runtimeReady: boolean;
  /** Human-readable summary. */
  label: string;
}

// ─── Fallback Config ────────────────────────────────────────────────────────

export interface AiFallbackConfig {
  /** URL of the Ollama server (set via settings). */
  ollamaUrl: string;
  /** Model to use for alt-text generation server-side. */
  altTextModel: string;
  /** Model to use for embeddings server-side. */
  embeddingModel: string;
  /** Whether to prefer the fallback unconditionally. */
  forceFallback: boolean;
}

// ─── Input / Output Types ───────────────────────────────────────────────────

export interface AltTextInput {
  /** Raw image bytes (e.g., from a File or Blob). */
  imageData: ArrayBuffer;
  /** MIME type for context (e.g., "image/png", "image/jpeg"). */
  mimeType: string;
  /** Optional hint about the image subject. */
  contextHint?: string;
}

export interface AltTextResult {
  /** Generated alt-text suggestion. */
  altText: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Which backend produced the result. */
  backend: "litert" | "ollama" | "failed";
  /** How long inference took (ms). */
  latencyMs: number;
}

export interface EmbeddingInput {
  /** Text to embed. */
  text: string;
  /** Optional — limit input length for embedding. */
  maxLength?: number;
}

export interface EmbeddingResult {
  /** Float32 vector. */
  vector: number[];
  /** Dimensionality. */
  dimensions: number;
  /** Which backend produced the result. */
  backend: "litert" | "ollama" | "tfidf" | "failed";
  /** How long inference took (ms). */
  latencyMs: number;
}
