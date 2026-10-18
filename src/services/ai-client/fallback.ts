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
import { rethrow } from "@utils/error-handling";

// ─── Configuration ──────────────────────────────────────────────────────────

const OLLAMA_TIMEOUT_MS = 120_000;
const OLLAMA_MAX_RESPONSE_BYTES = 1024 * 1024;

interface OllamaResponse {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * Fetch an admin-configured Ollama endpoint.
 *
 * This module also runs in the browser (the AI client falls back from the
 * LiteRT.js worker), so the Node-only egress guard cannot be imported
 * statically here — that would pull `node:dns`/`node:net` into the client
 * bundle. On the server we route through the shared guard; requests made from
 * the browser originate on the user's own machine and are not a server-side
 * SSRF surface.
 */
async function fetchOllama(url: string, init: RequestInit): Promise<OllamaResponse> {
  if (typeof window === "undefined") {
    // Cold path — only reached when this module is used outside the browser.
    const { safeFetch, validateEgressUrl } = await import("@utils/egress-guard");
    // OLLAMA_URL is admin-configured and normally loopback/LAN; allowPrivate is
    // scoped to this trusted endpoint and still blocks metadata/link-local.
    await validateEgressUrl(url, { allowHttp: true, allowPrivate: true });
    const result = await safeFetch(url, {
      allowHttp: true,
      allowPrivate: true,
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      body: init.body as string | undefined,
      timeoutMs: OLLAMA_TIMEOUT_MS,
      maxSizeBytes: OLLAMA_MAX_RESPONSE_BYTES,
    });
    return { ok: result.success, status: result.status ?? 0, text: result.body ?? "" };
  }

  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status, text: await response.text() };
}

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
  } catch (err) {
    rethrow(err);
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

    const response = await fetchOllama(`${ollamaUrl}/api/generate`, {
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

    const result = JSON.parse(response.text) as { response?: string };
    const altText = (result.response || "").trim();

    return {
      altText,
      confidence: altText.length > 5 ? 0.85 : 0.2,
      backend: "ollama",
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    rethrow(err);
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

    const response = await fetchOllama(`${ollamaUrl}/api/embeddings`, {
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

    const result = JSON.parse(response.text) as { embedding?: number[] };

    return {
      vector: result.embedding || [],
      dimensions: result.embedding?.length || 0,
      backend: "ollama",
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    rethrow(err);
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
