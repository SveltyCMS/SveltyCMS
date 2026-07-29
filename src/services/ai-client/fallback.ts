/**
 * @file src/services/ai-client/fallback.ts
 * @description
 * Server-side Ollama fallback for when LiteRT.js is unavailable.
 *
 * Runs on the server via SvelteKit server functions or API calls,
 * providing the identical interface as the LiteRT.js worker path.
 *
 * ### When This Is Used
 * 1. Browser doesn't support Web Workers or WebGPU
 * 2. LiteRT.js WASM runtime failed to load
 * 3. Model download failed
 * 4. Worker crashed repeatedly
 * 5. User prefers server-side inference (configurable)
 *
 * ### Security
 * All requests are authenticated via the existing CMS session.
 * No API keys are exposed to the client.
 *
 * @example
 *   ```typescript
 *   import { fallback } from "./fallback";
 *   const result = await fallback.generateAltText(imageData, mimeType);
 *   ```
 */

import type { AltTextResult, EmbeddingResult } from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Get the Ollama URL from the CMS settings.
 * Falls back to the default Ollama port.
 */
async function getOllamaUrl(): Promise<string> {
  try {
    const response = await fetch("/api/settings/private/OLLAMA_URL");
    if (response.ok) {
      const { data } = await response.json();
      return data?.value || "http://127.0.0.1:11434";
    }
  } catch {
    // Settings endpoint unavailable — use default
  }
  return "http://127.0.0.1:11434";
}

// ─── Alt-Text Fallback ──────────────────────────────────────────────────────

/**
 * Generate alt-text server-side via Ollama.
 *
 * The image is sent as a base64 data URL to a vision-capable model
 * (e.g., llava, bakllava). The response is a short description suitable
 * for use as HTML `alt` text.
 */
async function generateAltText(
  imageData: ArrayBuffer,
  mimeType: string,
  _contextHint?: string,
): Promise<AltTextResult> {
  const startTime = performance.now();

  try {
    const ollamaUrl = await getOllamaUrl();
    const base64 = arrayBufferToBase64(imageData);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llava",
        prompt: `Describe this image in one short sentence for use as HTML alt-text. Be concise, specific, and objective. Max 15 words.`,
        images: [dataUrl],
        stream: false,
        options: {
          num_predict: 40,
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const result = await response.json();
    const altText = (result.response || "").trim();

    return {
      altText,
      confidence: altText.length > 5 ? 0.85 : 0.2,
      backend: "ollama",
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    return {
      altText: "",
      confidence: 0,
      backend: "failed",
      latencyMs: Math.round(performance.now() - startTime),
      // @ts-expect-error err is unknown
      ...(err?.message ? { error: err.message } : {}),
    } as unknown as AltTextResult;
  }
}

// ─── Embedding Fallback ─────────────────────────────────────────────────────

/**
 * Generate text embeddings server-side via Ollama.
 *
 * Uses the `nomic-embed-text` model (same as the existing
 * `embedding-service.ts`), returning a 768-dimensional vector.
 */
async function generateEmbeddings(text: string, maxLength?: number): Promise<EmbeddingResult> {
  const startTime = performance.now();

  try {
    const ollamaUrl = await getOllamaUrl();
    const truncated = maxLength ? text.slice(0, maxLength) : text;

    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: truncated,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding returned ${response.status}`);
    }

    const result = await response.json();

    return {
      vector: result.embedding || [],
      dimensions: result.embedding?.length || 0,
      backend: "ollama",
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch {
    return {
      vector: [],
      dimensions: 0,
      backend: "failed",
      latencyMs: Math.round(performance.now() - startTime),
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const fallback = {
  generateAltText,
  generateEmbeddings,
};
