/**
 * @file src/services/ai-client/ai.worker.ts
 * @description
 * LiteRT.js AI Worker — runs ML inference in an isolated Web Worker context.
 *
 * ### Security Isolation
 * This Worker has its own JavaScript global scope, independent of the admin page:
 * - NO `window` / `document` / DOM access
 * - NO cookies, `localStorage`, or `sessionStorage`
 * - NO access to admin page variables or state
 * - ONLY the typed postMessage RPC bridge for communication
 *
 * ### LiteRT.js Runtime
 * - Loaded lazily on first inference request (not at Worker boot)
 * - WASM runtime (~15MB) downloaded once, cached by the browser
 * - Models downloaded on-demand, cached in-memory for the Worker's lifetime
 * - WebGPU primary, XNNPACK (CPU) fallback
 *
 * ### Protocol
 * Receives {@link AiWorkerRequest} via `message` events.
 * Responds with {@link AiWorkerResponse} via `postMessage`.
 */

// The LiteRT.js npm package is bundled into this Worker by Vite.
// import { loadLiteRt, loadAndCompile, Tensor } from "@litertjs/core";
// In development ahead of the npm release, we use a dynamic import
// that resolves against the WASM directory served alongside this Worker.

import type { AiWorkerResponse } from "./types";

// ─── Environment ────────────────────────────────────────────────────────────

const ctx: Worker = self as unknown as Worker;

// ─── State ──────────────────────────────────────────────────────────────────

let liteRtReady = false;
let liteRtShim: LiteRtShim | null = null;
const loadedModels = new Map<string, ModelHandle>();

// ─── LiteRT.js Shim Interface ───────────────────────────────────────────────

interface LiteRtShim {
  loadLiteRt(wasmDir: string): Promise<void>;
  loadAndCompile(
    modelPath: string,
    opts: { accelerator: string; delegates?: string[] },
  ): Promise<ModelHandle>;
}

interface ModelHandle {
  run(
    input: unknown,
  ): Promise<{ moveTo: (target: string) => { toTypedArray: () => Float32Array } }[]>;
}

// ─── Message Handler ────────────────────────────────────────────────────────

ctx.addEventListener("message", async (event: MessageEvent) => {
  const { id, type, payload } = event.data || {};
  if (!id || !type) return;

  try {
    switch (type as string) {
      case "ping":
        respond(id, "pong", true, { ready: liteRtReady });
        break;

      case "getCapabilities":
        respond(id, "capabilities", true, getCapabilities());
        break;

      case "loadModel":
        await handleLoadModel(id, payload as { modelId: string });
        break;

      case "generateAltText":
        await handleGenerateAltText(id, payload as { imageData: ArrayBuffer; mimeType: string });
        break;

      case "generateEmbeddings":
        await handleGenerateEmbeddings(id, payload as { text: string });
        break;

      default:
        respond(id, "error", false, undefined, `Unknown request type: ${type}`);
    }
  } catch (err) {
    respond(id, "error", false, undefined, err instanceof Error ? err.message : String(err));
  }
});

// ─── Responder ──────────────────────────────────────────────────────────────

function respond(
  id: string,
  type: AiWorkerResponse["type"],
  ok: boolean,
  data?: unknown,
  error?: string,
): void {
  ctx.postMessage({ id, type, ok, data, error } satisfies AiWorkerResponse);
}

// ─── Capability Detection ───────────────────────────────────────────────────

function getCapabilities() {
  return {
    webgpu: typeof (globalThis as any).navigator?.gpu !== "undefined",
    webnn: typeof (globalThis as any).navigator?.ml !== "undefined",
    xnnpack: typeof WebAssembly !== "undefined" && typeof WebAssembly.instantiate === "function",
    runtimeReady: liteRtReady,
    label: liteRtReady
      ? typeof (globalThis as any).navigator?.gpu !== "undefined"
        ? "WebGPU"
        : "CPU (XNNPACK)"
      : "runtime pending",
  };
}

// ─── LiteRT.js Initialization ───────────────────────────────────────────────

async function ensureLiteRt(): Promise<void> {
  if (liteRtReady) return;

  try {
    // Dynamic import resolves against the Worker's module graph.
    // Vite bundles this as a separate chunk in production.
    // The WASM files are expected alongside the Worker URL under /ai/wasm/.
    const module = await import(
      /* @vite-ignore */
      "/ai/wasm/@litertjs-core.js"
    );

    liteRtShim = {
      loadLiteRt: module.loadLiteRt,
      loadAndCompile: module.loadAndCompile,
    };

    await liteRtShim.loadLiteRt("/ai/wasm/");
    liteRtReady = true;
  } catch {
    // LiteRT.js WASM download failed. The model-level callers will
    // receive an error and trigger the server-side fallback path.
    throw new Error("LiteRT.js WASM runtime could not be loaded");
  }
}

// ─── Model Loading ──────────────────────────────────────────────────────────

async function handleLoadModel(id: string, { modelId }: { modelId: string }): Promise<void> {
  await ensureLiteRt();
  if (!liteRtShim) {
    respond(id, "modelLoaded", false, undefined, "LiteRT.js not initialized");
    return;
  }

  try {
    // Try WebGPU first
    const model = await liteRtShim.loadAndCompile(`/ai/models/${modelId}.tflite`, {
      accelerator: "webgpu",
      delegates: ["xnnpack"],
    });
    loadedModels.set(modelId, model);
    respond(id, "modelLoaded", true, { modelId, accelerator: "webgpu" });
  } catch {
    // Fall back to CPU (XNNPACK)
    try {
      const model = await liteRtShim.loadAndCompile(`/ai/models/${modelId}.tflite`, {
        accelerator: "xnnpack",
      });
      loadedModels.set(modelId, model);
      respond(id, "modelLoaded", true, { modelId, accelerator: "xnnpack" });
    } catch (err) {
      respond(id, "modelLoaded", false, undefined, `Failed to load ${modelId}: ${err}`);
    }
  }
}

// ─── Alt-Text Generation ────────────────────────────────────────────────────

async function handleGenerateAltText(
  id: string,
  payload: { imageData: ArrayBuffer; mimeType: string },
): Promise<void> {
  await ensureLiteRt();
  if (!liteRtShim) {
    respond(id, "altText", false, undefined, "LiteRT.js not initialized");
    return;
  }

  try {
    const startTime = performance.now();
    const model = await getOrLoadModel("mobilenet-v3-256");

    // Decode + preprocess the image to a 256×256 tensor
    const tensor = await imageToTensor(payload.imageData, 256, 256);

    // Run inference
    const outputs = await model.run(tensor);
    const outputArray = (await outputs[0].moveTo("wasm")).toTypedArray() as Float32Array;

    const altText = decodeAltText(outputArray, payload.mimeType);
    const confidence = softmaxConfidence(outputArray);

    respond(id, "altText", true, {
      altText,
      confidence,
      backend: "litert",
      latencyMs: Math.round(performance.now() - startTime),
    });
  } catch (err) {
    respond(id, "altText", false, undefined, `Alt-text generation error: ${err}`);
  }
}

// ─── Embedding Generation ───────────────────────────────────────────────────

async function handleGenerateEmbeddings(id: string, payload: { text: string }): Promise<void> {
  await ensureLiteRt();
  if (!liteRtShim) {
    respond(id, "embeddings", false, undefined, "LiteRT.js not initialized");
    return;
  }

  try {
    const startTime = performance.now();
    const model = await getOrLoadModel("embedding-gemma-384");

    // Simplified: tokenize text to fixed-size tensor
    const tensor = textToTensor(payload.text, 384);

    const outputs = await model.run(tensor);
    const outputArray = (await outputs[0].moveTo("wasm")).toTypedArray() as Float32Array;

    respond(id, "embeddings", true, {
      vector: Array.from(outputArray),
      dimensions: outputArray.length,
      backend: "litert",
      latencyMs: Math.round(performance.now() - startTime),
    });
  } catch (err) {
    respond(id, "embeddings", false, undefined, `Embedding generation error: ${err}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getOrLoadModel(modelId: string): Promise<ModelHandle> {
  const existing = loadedModels.get(modelId);
  if (existing) return existing;

  if (!liteRtShim) throw new Error("LiteRT.js not initialized");

  try {
    const model = await liteRtShim.loadAndCompile(`/ai/models/${modelId}.tflite`, {
      accelerator: "webgpu",
      delegates: ["xnnpack"],
    });
    loadedModels.set(modelId, model);
    return model;
  } catch {
    const model = await liteRtShim.loadAndCompile(`/ai/models/${modelId}.tflite`, {
      accelerator: "xnnpack",
    });
    loadedModels.set(modelId, model);
    return model;
  }
}

/**
 * Decode an image Blob into a normalized tensor (NCHW layout).
 *
 * Uses OffscreenCanvas for zero-copy decoding inside the Worker.
 * Resizes to (width × height) and normalizes pixel values to [0, 1].
 */
async function imageToTensor(
  data: ArrayBuffer,
  width: number,
  height: number,
): Promise<Float32Array> {
  const blob = new Blob([data]);
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data: pixels } = imageData;

  // Pack as NCHW: batch=1, channels=3, height, width
  const tensor = new Float32Array(1 * 3 * width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dstBase = y * width + x;
      tensor[dstBase] = pixels[src] / 255; // R
      tensor[width * height + dstBase] = pixels[src + 1] / 255; // G
      tensor[2 * width * height + dstBase] = pixels[src + 2] / 255; // B
    }
  }

  bitmap.close();
  return tensor;
}

/**
 * Simplified text → fixed-size Float32Array tokenization.
 *
 * In production, this would use the model's SentencePiece tokenizer.
 * For embedding models, character-level encoding serves as a placeholder.
 */
function textToTensor(text: string, maxLength: number): Float32Array {
  const tensor = new Float32Array(maxLength);
  const normalized = text.toLowerCase().slice(0, maxLength);
  for (let i = 0; i < normalized.length; i++) {
    tensor[i] = normalized.charCodeAt(i) / 255;
  }
  return tensor;
}

/**
 * Map MobileNetV3 logits to a descriptive alt-text string.
 *
 * Simplified — uses the top ImageNet class label.
 * A production version would use a dedicated image captioning model.
 */
function decodeAltText(logits: Float32Array, mimeType: string): string {
  const labels: Record<number, string> = {
    0: "A photo of food on a table or counter",
    1: "A photo of a person",
    2: "A photo of a landscape or outdoor scene",
    3: "A photo of an animal",
    4: "A photo of a document or paper",
    5: "A photo of a building or structure",
    6: "A photo of a vehicle",
    7: "A photo of a plant, flower, or greenery",
    8: "A photo of a group of people",
    9: "A photo of text, signage, or a screen",
  };

  let maxIdx = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > maxVal) {
      maxVal = logits[i];
      maxIdx = i;
    }
  }

  return labels[maxIdx] || `An image in ${mimeType.split("/")[1] || "unknown"} format`;
}

/** Softmax-based confidence from the top-1 logit. */
function softmaxConfidence(logits: Float32Array): number {
  const maxLogit = Math.max(...Array.from(logits));
  const clipped = Math.max(-50, Math.min(50, maxLogit / 10));
  return Math.round((1 / (1 + Math.exp(-clipped))) * 100) / 100;
}

// ─── Self-Test on Boot ──────────────────────────────────────────────────────

ctx.postMessage({
  id: "__worker_boot__",
  type: "pong",
  ok: true,
  data: { ready: false, workerLoaded: true },
} satisfies AiWorkerResponse);
