/**
 * @file tests/unit/services/intelligence/semantic-index-eviction.test.ts
 * @description Regression tests for semantic index eviction of deleted content.
 *
 * Features:
 * - removeFromSemanticIndex evicts an entry by id
 * - a later query no longer returns the evicted (deleted) content
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { embedMock, embedSingleMock, cosineSimilarityMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  embedSingleMock: vi.fn(),
  cosineSimilarityMock: vi.fn(),
}));

vi.mock("@src/services/intelligence/embedding-service", () => ({
  embed: embedMock,
  embedSingle: embedSingleMock,
  cosineSimilarity: cosineSimilarityMock,
}));

type SemanticIndexModule = typeof import("@src/services/intelligence/semantic-index");

async function loadIndex(): Promise<SemanticIndexModule> {
  return import("@src/services/intelligence/semantic-index");
}

const ENTRIES = [
  {
    id: "entry:posts:1",
    type: "entry" as const,
    title: "Deleted Post",
    description: "This entry has been deleted",
    path: "/posts/1",
    keywords: ["post"],
    collectionId: "posts",
  },
  {
    id: "entry:posts:2",
    type: "entry" as const,
    title: "Live Post",
    description: "This entry still exists",
    path: "/posts/2",
    keywords: ["post"],
    collectionId: "posts",
  },
];

beforeEach(() => {
  vi.resetModules();
  embedMock.mockReset();
  embedSingleMock.mockReset();
  cosineSimilarityMock.mockReset();

  cosineSimilarityMock.mockReturnValue(1);
  embedMock.mockImplementation(async (texts: string[]) =>
    texts.map((_, i) => ({
      vector: [1, i],
      backend: "tfidf" as const,
      dimensions: 2,
      latencyMs: 0,
    })),
  );
  embedSingleMock.mockImplementation(async () => ({
    vector: [1, 0],
    backend: "tfidf" as const,
    dimensions: 2,
    latencyMs: 0,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Semantic index eviction", () => {
  it("does not return deleted content from a later query", async () => {
    const index = await loadIndex();

    await index.indexBatch(ENTRIES);

    const before = await index.semanticSearch("post");
    expect(before.map((r) => r.id)).toContain("entry:posts:1");

    expect(index.removeFromSemanticIndex("entry:posts:1")).toBe(true);

    const after = await index.semanticSearch("post");
    const afterIds = after.map((r) => r.id);

    expect(afterIds).toContain("entry:posts:2");
    expect(afterIds).not.toContain("entry:posts:1");
  });

  it("returns false when evicting an id that is not indexed", async () => {
    const index = await loadIndex();
    expect(index.removeFromSemanticIndex("entry:posts:missing")).toBe(false);
  });
});
