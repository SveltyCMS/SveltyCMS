/**
 * @file tests/unit/services/semantic-reranker.test.ts
 * @description Unit tests for the AI semantic index candidate reranker.
 */

import { describe, expect, it, vi } from "vitest";
import {
  rerankCandidates,
  rerankCandidatesSync,
  type SearchResult,
} from "@src/services/intelligence/semantic-index";

describe("Candidate Reranker", () => {
  const mockCandidates: SearchResult[] = [
    {
      id: "admin:dashboard",
      type: "admin-page",
      title: "Dashboard",
      description: "System overview and activity monitoring",
      path: "/dashboard",
      keywords: ["home", "overview"],
      vector: [0.1, 0.2],
      indexedAt: 1000,
      score: 0.65,
      matchType: "semantic",
    },
    {
      id: "admin:media",
      type: "admin-page",
      title: "Media Gallery",
      description: "Digital asset management with batch editing and images",
      path: "/mediagallery",
      keywords: ["media", "images", "assets"],
      vector: [0.3, 0.4],
      indexedAt: 1000,
      score: 0.6,
      matchType: "semantic",
    },
    {
      id: "admin:user",
      type: "admin-page",
      title: "User Profile",
      description: "Account and password management",
      path: "/user",
      keywords: ["profile", "user"],
      vector: [0.2, 0.1],
      indexedAt: 1000,
      score: 0.55,
      matchType: "semantic",
    },
    {
      id: "entry:posts:1",
      type: "entry",
      title: "Old News Post",
      description: "Archived newsletter",
      path: "/posts/1",
      keywords: ["news"],
      vector: [0.1, 0.1],
      indexedAt: 1000,
      score: 0.4,
      matchType: "keyword",
    },
  ];

  it("returns a copy if candidate list is empty or has a single candidate", async () => {
    expect(await rerankCandidates("query", [])).toEqual([]);
    const single = [mockCandidates[0]];
    const res = await rerankCandidates("query", single);
    expect(res).toEqual(single);
  });

  it("re-orders candidates so that higher answer-relevance candidates move to the top", async () => {
    // Query specifically about media and digital assets
    const query = "how to manage media gallery images and assets";
    const reranked = await rerankCandidates(query, mockCandidates, { topN: 3 });

    // In the initial list, Dashboard was #1 (0.65) and Media Gallery was #2 (0.60).
    // After reranking with a query heavily aligned with media gallery, Media Gallery should become #1!
    expect(reranked[0].id).toBe("admin:media");
    expect(reranked[0].score).toBeGreaterThan(reranked[1].score);

    // Candidates beyond topN (entry:posts:1) must remain at their original trailing position
    expect(reranked[3].id).toBe("entry:posts:1");
  });

  it("supports synchronous reranking with rerankCandidatesSync", () => {
    const query = "change user profile password";
    const reranked = rerankCandidatesSync(query, mockCandidates, { topN: 3 });

    // User profile should move to top
    expect(reranked[0].id).toBe("admin:user");
  });

  it("supports custom scoring hook", async () => {
    const customScorer = vi.fn().mockImplementation((_query: string, candidate: SearchResult) => {
      // Prioritize entry over admin-page
      return candidate.type === "entry" ? 0.99 : 0.1;
    });

    const reranked = await rerankCandidates("test", mockCandidates, {
      topN: 4,
      customScorer,
    });

    expect(reranked[0].id).toBe("entry:posts:1");
    expect(reranked[0].score).toBe(0.99);
    expect(customScorer).toHaveBeenCalledTimes(4);
  });

  it("falls back gracefully when custom scorer throws", async () => {
    const customScorer = vi.fn().mockRejectedValue(new Error("LLM timeout"));

    const query = "how to manage media gallery images";
    const reranked = await rerankCandidates(query, mockCandidates, {
      topN: 3,
      customScorer,
    });

    // Still succeeds using default lexical alignment scoring
    expect(reranked.length).toBe(mockCandidates.length);
    expect(reranked[0].id).toBe("admin:media");
  });
});
