/**
 * @file tests/unit/services/embedding-service.test.ts
 * @description Unit tests for the Ollama embedding backend: batch request shape,
 * legacy per-text fallback, malformed responses, and single-text behaviour.
 *
 * `fetch` is stubbed — no network access. The module caches `_backend` /
 * `_ollamaAvailable` at module scope, so every test resets the registry and
 * dynamically re-imports the service.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EmbeddingServiceModule = typeof import("@src/services/intelligence/embedding-service");

const OLLAMA_BASE = "http://ollama.test";

const { safeFetchMock, validateEgressUrlMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  validateEgressUrlMock: vi.fn(async (url: string) => new URL(url)),
}));

vi.mock("@utils/egress-guard", () => ({
  safeFetch: safeFetchMock,
  validateEgressUrl: validateEgressUrlMock,
}));

type EgressResult = {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
};
type FetchHandler = (url: string, init?: RequestInit) => EgressResult | Promise<EgressResult>;
type PrivateEnvGlobal = { privateEnv?: Record<string, unknown> };

function jsonResponse(body: unknown, status = 200): EgressResult {
  return {
    success: status >= 200 && status < 300,
    status,
    body: JSON.stringify(body),
  };
}

function installFetch(handler: FetchHandler) {
  safeFetchMock.mockImplementation((url: string, init?: RequestInit) => handler(url, init));
  return safeFetchMock;
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

/**
 * Import a fresh module instance and prime backend detection, so the `/api/tags`
 * availability probe is not counted in the assertions made by `embed()`.
 */
async function loadOllamaService(
  fetchMock: ReturnType<typeof installFetch>,
): Promise<EmbeddingServiceModule> {
  const service = await import("@src/services/intelligence/embedding-service");
  expect(await service.detectEmbeddingBackend()).toBe("ollama");
  fetchMock.mockClear();
  return service;
}

beforeEach(() => {
  vi.resetModules();
  safeFetchMock.mockReset();
  validateEgressUrlMock.mockReset();
  validateEgressUrlMock.mockImplementation(async (url: string) => new URL(url));
  (globalThis as unknown as PrivateEnvGlobal).privateEnv = { OLLAMA_URL: OLLAMA_BASE };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as PrivateEnvGlobal).privateEnv;
});

describe("embedding-service Ollama transport", () => {
  it("sends many texts as a single batch request to /api/embed", async () => {
    const longText = "x".repeat(9000);
    const fetchMock = installFetch((url, init) => {
      if (url === `${OLLAMA_BASE}/api/tags`) return jsonResponse({ models: [] });
      if (url === `${OLLAMA_BASE}/api/embed`) {
        expect(init?.method).toBe("POST");
        return jsonResponse({
          embeddings: [
            [0.1, 0.2],
            [0.3, 0.4],
            [0.5, 0.6],
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const { embed } = await loadOllamaService(fetchMock);

    const results = await embed(["alpha", "beta", longText]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${OLLAMA_BASE}/api/embed`);

    const body = parseBody(init);
    expect(body.model).toBe("nomic-embed-text");
    expect(body.input).toEqual(["alpha", "beta", "x".repeat(8000)]);

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.vector)).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
    expect(results.every((result) => result.backend === "ollama")).toBe(true);
    expect(results.every((result) => result.dimensions === 2)).toBe(true);
  });

  it.each([404, 405])(
    "falls back to per-text /api/embeddings when /api/embed returns %i",
    async (status) => {
      const fetchMock = installFetch((url) => {
        if (url === `${OLLAMA_BASE}/api/tags`) return jsonResponse({ models: [] });
        if (url === `${OLLAMA_BASE}/api/embed`) {
          return jsonResponse({ error: "unsupported" }, status);
        }
        if (url === `${OLLAMA_BASE}/api/embeddings`) return jsonResponse({ embedding: [1, 2, 3] });
        throw new Error(`Unexpected request: ${url}`);
      });
      const { embed } = await loadOllamaService(fetchMock);

      const texts = ["one", "two", "three"];
      const results = await embed(texts);

      // One failed batch request + one legacy request per text.
      expect(fetchMock).toHaveBeenCalledTimes(texts.length + 1);

      const legacyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/embeddings"),
      );
      expect(legacyCalls).toHaveLength(texts.length);
      expect(legacyCalls.map(([, init]) => parseBody(init).prompt)).toEqual(texts);

      expect(results).toHaveLength(texts.length);
      expect(results.every((result) => result.vector.length === 3)).toBe(true);
      expect(results.every((result) => result.backend === "ollama")).toBe(true);
    },
  );

  it("falls back safely when the batch response has no embeddings array", async () => {
    const fetchMock = installFetch((url) => {
      if (url === `${OLLAMA_BASE}/api/tags`) return jsonResponse({ models: [] });
      if (url === `${OLLAMA_BASE}/api/embed`) return jsonResponse({ model: "nomic-embed-text" });
      if (url === `${OLLAMA_BASE}/api/embeddings`) return jsonResponse({ embedding: [0.25, 0.5] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const { embed } = await loadOllamaService(fetchMock);

    const results = await embed(["first", "second"]);

    expect(fetchMock).toHaveBeenCalledTimes(3); // batch + two legacy
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.vector)).toEqual([
      [0.25, 0.5],
      [0.25, 0.5],
    ]);
  });

  it("falls back safely when the batch response has the wrong number of vectors", async () => {
    const fetchMock = installFetch((url) => {
      if (url === `${OLLAMA_BASE}/api/tags`) return jsonResponse({ models: [] });
      if (url === `${OLLAMA_BASE}/api/embed`) return jsonResponse({ embeddings: [[1, 2]] });
      if (url === `${OLLAMA_BASE}/api/embeddings`) return jsonResponse({ embedding: [3, 4] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const { embed } = await loadOllamaService(fetchMock);

    const results = await embed(["a", "b"]);

    expect(fetchMock).toHaveBeenCalledTimes(3); // batch + two legacy
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.vector)).toEqual([
      [3, 4],
      [3, 4],
    ]);
  });

  it("keeps single-text behaviour (one batch request, one result)", async () => {
    const fetchMock = installFetch((url) => {
      if (url === `${OLLAMA_BASE}/api/tags`) return jsonResponse({ models: [] });
      if (url === `${OLLAMA_BASE}/api/embed`) return jsonResponse({ embeddings: [[0.5, 0.25]] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const { embed } = await loadOllamaService(fetchMock);

    const results = await embed(["solo"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${OLLAMA_BASE}/api/embed`);
    expect(parseBody(init).input).toEqual(["solo"]);

    expect(results).toHaveLength(1);
    expect(results[0].vector).toEqual([0.5, 0.25]);
    expect(results[0].backend).toBe("ollama");
    expect(results[0].dimensions).toBe(2);
    expect(typeof results[0].latencyMs).toBe("number");
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);
  });
});
