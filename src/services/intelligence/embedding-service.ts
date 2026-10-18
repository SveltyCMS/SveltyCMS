/**
 * @file src/services/intelligence/embedding-service.ts
 * @description Pluggable embedding backend for semantic search indexing.
 *
 * Generates dense vector embeddings from text content for similarity search.
 * Backend auto-selection: Ollama (NPU/GPU) → TF-IDF (CPU, zero-deps fallback).
 *
 * ### Why This Architecture:
 * - Primary: Ollama embedding API — already installed, auto-uses Intel NPU/GPU
 * - Fallback: In-process TF-IDF — instant, zero network, works everywhere
 * - Both implement the same interface: embed(text) → number[]
 * - On Intel Core Ultra: Ollama detects NPU via SYCL/OpenVINO → hardware-accelerated
 * - No new npm dependencies required
 *
 * ### Performance:
 * - Ollama (NPU): one `/api/embed` round-trip per batch (~5ms)
 * - Ollama (CPU): one round-trip per batch
 * - TF-IDF (CPU): <1ms per document (no model, just term frequencies)
 *
 * ### Batch transport:
 * - Preferred: `POST /api/embed` with the full `input` array (one round-trip).
 * - Fallback: older Ollama builds without that endpoint (HTTP 404/405) or a
 *   malformed batch response are served by the legacy per-text
 *   `POST /api/embeddings` loop, so behaviour is unchanged there.
 */

import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import { safeFetch, validateEgressUrl } from "@utils/egress-guard";
import { getPrivateSetting } from "@src/services/core/settings-service";

// ─── Types ────────────────────────────────────────────────────────────────

export type EmbeddingBackend = "ollama" | "tfidf" | "auto";

export interface EmbeddingResult {
  vector: number[];
  backend: EmbeddingBackend;
  dimensions: number;
  latencyMs: number;
}

// ─── Configuration ─────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "nomic-embed-text"; // 274MB, 768-dim, fast on NPU
const EMBEDDING_DIMS = 768;
const TFIDF_DIMS = 256; // smaller for fallback
const OLLAMA_TIMEOUT_MS = 5000;
/** Ollama is admin-configured and normally local — see the trust note below. */
const OLLAMA_EGRESS = { allowHttp: true, allowPrivate: true } as const;
const AVAILABILITY_MAX_BYTES = 1024 * 1024;
const EMBEDDING_MAX_BYTES = 10 * 1024 * 1024;

// ─── Backend State ─────────────────────────────────────────────────────────

let _backend: EmbeddingBackend = "auto";
let _ollamaAvailable: boolean | null = null;
let _tfidfVocabulary: Map<string, number> | null = null;

/** Cached lazy handle to the Ollama base URL — settings lookup happens once per process. */
let _ollamaBasePromise: Promise<string> | undefined;
function getOllamaBase(): Promise<string> {
  return (_ollamaBasePromise ??= getPrivateSetting("OLLAMA_URL").then(
    (url) => url || "http://127.0.0.1:11434",
  ));
}

// ─── TF-IDF Fallback Engine (Zero Dependencies) ────────────────────────────

function buildTfidfVocabulary(texts: string[]): Map<string, number> {
  // Build vocabulary from all texts (top TFIDF_DIMS terms by frequency)
  const freq = new Map<string, number>();
  for (const text of texts) {
    const tokens = text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1);
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }
  // Sort by frequency, take top N
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, TFIDF_DIMS);
  return new Map(sorted.map(([term], i) => [term, i]));
}

function tfidfEmbed(text: string, vocabulary: Map<string, number>): number[] {
  const vector = Array.from({ length: TFIDF_DIMS }, () => 0);
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return vector;

  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  for (const [term, freq] of tf) {
    const idx = vocabulary.get(term);
    if (idx !== undefined) {
      vector[idx] = freq / tokens.length; // normalized TF
    }
  }
  return vector;
}

// ─── Ollama Backend ────────────────────────────────────────────────────────

async function checkOllamaAvailable(): Promise<boolean> {
  if (_ollamaAvailable !== null) return _ollamaAvailable;
  try {
    const base = await getOllamaBase();
    // 🛡️ SSRF: OLLAMA_URL is admin-configured; allowPrivate keeps localhost/LAN
    // model servers reachable while metadata/link-local hosts remain blocked.
    const url = `${base}/api/tags`;
    await validateEgressUrl(url, OLLAMA_EGRESS);
    const res = await safeFetch(url, {
      ...OLLAMA_EGRESS,
      timeoutMs: 2000,
      maxSizeBytes: AVAILABILITY_MAX_BYTES,
    });
    _ollamaAvailable = res.success;
    if (_ollamaAvailable) {
      logger.info("[Embedding] Ollama detected — using NPU/GPU-accelerated embeddings");
    }
  } catch (err) {
    rethrow(err);
    _ollamaAvailable = false;
    logger.info("[Embedding] Ollama not available — using in-process TF-IDF fallback");
  }
  return _ollamaAvailable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

/** Truncate to the model's context window (~8192 tokens for nomic-embed-text). */
function truncateForModel(text: string): string {
  return text.slice(0, 8000);
}

/**
 * Legacy per-text transport (one round-trip per text).
 * Kept for older Ollama builds that predate the batch `/api/embed` endpoint.
 */
async function ollamaEmbedPerText(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  const base = await getOllamaBase();

  for (const text of texts) {
    const url = `${base}/api/embeddings`;
    await validateEgressUrl(url, OLLAMA_EGRESS);
    const res = await safeFetch(url, {
      ...OLLAMA_EGRESS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: truncateForModel(text) }),
      timeoutMs: OLLAMA_TIMEOUT_MS,
      maxSizeBytes: EMBEDDING_MAX_BYTES,
    });

    if (!res.success || !res.body) {
      throw new Error(`Ollama embedding failed: ${res.status ?? res.error ?? "error"}`);
    }
    const data: unknown = JSON.parse(res.body);
    const embedding = isRecord(data) && isNumberVector(data.embedding) ? data.embedding : [];
    vectors.push(embedding);
  }

  return vectors;
}

/**
 * Batch transport: `POST /api/embed` with the whole `input` array in one request.
 * Falls back to {@link ollamaEmbedPerText} when the endpoint is missing (404/405)
 * or the response does not contain one numeric vector per input text.
 */
async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const base = await getOllamaBase();
  const url = `${base}/api/embed`;
  await validateEgressUrl(url, OLLAMA_EGRESS);
  const res = await safeFetch(url, {
    ...OLLAMA_EGRESS,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts.map(truncateForModel),
    }),
    timeoutMs: OLLAMA_TIMEOUT_MS,
    maxSizeBytes: EMBEDDING_MAX_BYTES,
  });

  // Older Ollama builds only expose /api/embeddings — treat 404/405 as "unsupported".
  if (res.status === 404 || res.status === 405) {
    logger.debug(
      `[Embedding] Ollama /api/embed unavailable (HTTP ${res.status}) — using per-text /api/embeddings`,
    );
    return ollamaEmbedPerText(texts);
  }

  if (!res.success || !res.body) {
    throw new Error(`Ollama embedding failed: ${res.status ?? res.error ?? "error"}`);
  }

  const data: unknown = JSON.parse(res.body);
  const rawEmbeddings = isRecord(data) ? data.embeddings : undefined;

  if (!Array.isArray(rawEmbeddings)) {
    logger.warn(
      "[Embedding] Ollama /api/embed returned no embeddings array — using per-text fallback",
    );
    return ollamaEmbedPerText(texts);
  }

  if (rawEmbeddings.length !== texts.length) {
    logger.warn(
      `[Embedding] Ollama /api/embed returned ${rawEmbeddings.length} vectors for ${texts.length} texts — using per-text fallback`,
    );
    return ollamaEmbedPerText(texts);
  }

  const embeddings = rawEmbeddings.filter(isNumberVector);
  if (embeddings.length !== texts.length) {
    logger.warn(
      "[Embedding] Ollama /api/embed returned malformed vectors — using per-text fallback",
    );
    return ollamaEmbedPerText(texts);
  }

  return embeddings;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Auto-detect the best available backend.
 * Call once at startup to cache the detection result.
 */
export async function detectEmbeddingBackend(): Promise<EmbeddingBackend> {
  if (_backend !== "auto") return _backend;

  const ollamaOk = await checkOllamaAvailable();
  _backend = ollamaOk ? "ollama" : "tfidf";
  return _backend;
}

/**
 * Generate embeddings for one or more text strings.
 *
 * On Intel Core Ultra with NPU:
 *   Ollama → SYCL/OpenVINO → Intel AI Boost NPU → one batch round-trip
 *
 * Without NPU:
 *   Ollama → CPU → one batch round-trip (per-text fallback for old Ollama)
 *
 * Fallback (no Ollama):
 *   TF-IDF → CPU → <1ms per document
 *
 * @param texts - One or more text strings to embed
 * @returns Array of EmbeddingResult (one per input text)
 */
export async function embed(texts: string[]): Promise<EmbeddingResult[]> {
  const t0 = performance.now();
  const backend = await detectEmbeddingBackend();

  if (backend === "ollama") {
    try {
      const vectors = await ollamaEmbed(texts);
      const latency = Math.round(performance.now() - t0);
      return vectors.map((vector) => ({
        vector,
        backend: "ollama",
        dimensions: vector.length || EMBEDDING_DIMS,
        latencyMs: latency / texts.length,
      }));
    } catch (err) {
      logger.warn("[Embedding] Ollama failed, falling back to TF-IDF", err);
      _ollamaAvailable = false;
      _backend = "tfidf";
      // Fall through to TF-IDF
    }
  }

  // TF-IDF fallback
  if (!_tfidfVocabulary) {
    _tfidfVocabulary = buildTfidfVocabulary(texts);
  }
  const latency = Math.round(performance.now() - t0);
  return texts.map((text) => ({
    vector: tfidfEmbed(text, _tfidfVocabulary!),
    backend: "tfidf",
    dimensions: TFIDF_DIMS,
    latencyMs: latency / texts.length,
  }));
}

/**
 * Embed a single text string. Convenience wrapper.
 */
export async function embedSingle(text: string): Promise<EmbeddingResult> {
  const results = await embed([text]);
  return results[0];
}

/**
 * Cosine similarity between two vectors.
 * Returns 0–1 where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Pad shorter vector for cross-backend comparison
    const maxLen = Math.max(a.length, b.length);
    const a2 = [...a, ...Array.from({ length: maxLen - a.length }, () => 0)];
    const b2 = [...b, ...Array.from({ length: maxLen - b.length }, () => 0)];
    return _cosine(a2, b2);
  }
  return _cosine(a, b);
}

function _cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Get current backend info for dashboard display.
 */
export function getEmbeddingBackendInfo(): {
  backend: EmbeddingBackend;
  available: boolean;
  model?: string;
} {
  return {
    backend: _backend,
    available: _ollamaAvailable ?? false,
    model: _ollamaAvailable ? EMBEDDING_MODEL : "TF-IDF (in-process)",
  };
}
