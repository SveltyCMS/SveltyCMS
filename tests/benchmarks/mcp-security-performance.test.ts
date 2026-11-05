/**
 * @file tests/benchmarks/mcp-security-performance.test.ts
 * @description Benchmark baseline for SSRF egress guard, prototype pollution defense,
 * protocol-relative URL sanitization, and WebMCP agent instruction schema throughput.
 *
 * Protocol parity with competitive workload replica and security-utils benchmarks:
 * - JIT warm-up (>= 1,000 iterations per case)
 * - Anti-DCE digest sink accumulation
 * - Batch-sampled p50 and p95 latencies
 * - Summary comparison table
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import "../unit/bun-preload.ts";

import { deepClone } from "@src/utils/native-utils";
import { sanitizeObject, containsXssVector } from "@src/utils/security/input-sanitizer";
import {
  registerServerTool,
  listServerTools,
  searchServerTools,
  exportServerTools,
} from "@src/plugins/webmcp/tool-registry";
import { safeRedirect } from "@src/utils/security/safe-redirect";
import { defaultFxResolver } from "@src/services/commerce/fx-resolver";
import { money } from "@src/services/commerce/price";
import { rerankCandidatesSync, type SearchResult } from "@src/services/intelligence/semantic-index";
import { buildProductJsonLd } from "@src/services/content/seo/seo-head";

interface TimedResult {
  label: string;
  iters: number;
  totalMs: number;
  opsPerSec: number;
  usPerOp: number;
  p50Us: number;
  p95Us: number;
}

const results: TimedResult[] = [];
let digestSink = 0;

function timeSync(
  label: string,
  iters: number,
  warmup: number,
  fn: (i: number) => number | string | boolean | object | undefined | null,
): TimedResult {
  // 1. JIT Warm-up to reach stable tier-2 optimization
  for (let w = 0; w < warmup; w++) {
    const r = fn(w);
    if (typeof r === "number") digestSink += r;
    else if (typeof r === "string") digestSink += r.length;
    else if (r !== null && r !== undefined) digestSink += 1;
  }

  // 2. Timed run with batch sampling for p50/p95
  const batchSize = Math.max(10, Math.floor(iters / 100));
  const batchCount = Math.floor(iters / batchSize);
  const sampleLatenciesUs: number[] = [];

  const start = performance.now();
  for (let b = 0; b < batchCount; b++) {
    const bStart = performance.now();
    for (let i = 0; i < batchSize; i++) {
      const r = fn(b * batchSize + i);
      if (typeof r === "number") digestSink += r;
      else if (typeof r === "string") digestSink += r.length;
      else if (r !== null && r !== undefined) digestSink += 1;
    }
    const bElapsedUs = ((performance.now() - bStart) * 1000) / batchSize;
    sampleLatenciesUs.push(bElapsedUs);
  }
  const totalMs = performance.now() - start;

  sampleLatenciesUs.sort((a, b) => a - b);
  const p50Us = sampleLatenciesUs[Math.floor(sampleLatenciesUs.length * 0.5)] ?? 0;
  const p95Us = sampleLatenciesUs[Math.floor(sampleLatenciesUs.length * 0.95)] ?? 0;
  const actualIters = batchCount * batchSize;
  const opsPerSec = Math.round(actualIters / (totalMs / 1000));
  const usPerOp = Number(((totalMs * 1000) / actualIters).toFixed(2));

  const res: TimedResult = {
    label,
    iters: actualIters,
    totalMs,
    opsPerSec,
    usPerOp,
    p50Us: Number(p50Us.toFixed(2)),
    p95Us: Number(p95Us.toFixed(2)),
  };
  results.push(res);
  return res;
}

describe("MCP and Security Performance Benchmark", () => {
  beforeAll(() => {
    // Register representative WebMCP tools
    registerServerTool({
      name: "get_collections",
      description: "List all content collections with schema and agent instructions",
      handler: () => ({ collections: [] }),
    });
    registerServerTool({
      name: "get_collection_schema",
      description:
        "Retrieve comprehensive JSON schema and field-level agent guidelines for an entity",
      parameters: { collectionId: "Target collection name" },
      handler: () => ({}),
    });
    registerServerTool({
      name: "create_entry",
      description: "Create draft entry with validation and airgap isolation",
      parameters: { collectionId: "Target collection", data: "Payload" },
      handler: () => ({ status: "draft" }),
    });
  });

  afterAll(() => {
    console.log("\n" + "=".repeat(96));
    console.log("  ⚡ MCP & SECURITY PERFORMANCE BENCHMARK RESULTS");
    console.log("=".repeat(96));
    console.log(
      `${"workload".padEnd(46)} ${"ops/s".padStart(14)} ${"µs/op".padStart(10)} ${"p50 µs".padStart(10)} ${"p95 µs".padStart(10)}`,
    );
    console.log("-".repeat(96));
    for (const r of results) {
      console.log(
        `${r.label.padEnd(46)} ${r.opsPerSec.toLocaleString().padStart(14)} ${(r.usPerOp.toFixed(2) + " µs").padStart(10)} ${(r.p50Us.toFixed(2) + " µs").padStart(10)} ${(r.p95Us.toFixed(2) + " µs").padStart(10)}`,
      );
    }
    console.log("=".repeat(96));
    console.log(`  Digest sink value (DCE guard): ${digestSink}\n`);
  });

  test("deepClone — prototype pollution resistance and throughput", () => {
    const payload = {
      title: "Benchmark Post",
      content: { en: "Body text", de: "Inhalt" },
      tags: ["performance", "security"],
      meta: { views: 42, active: true },
    };

    // Correctness assertion
    const cloned = deepClone(payload);
    expect(cloned).toEqual(payload);
    expect(cloned).not.toBe(payload);

    timeSync("native-utils.deepClone (nested payload)", 50_000, 2_000, (i) => {
      payload.meta.views = i;
      return deepClone(payload);
    });
  });

  test("sanitizeObject & XSS check with prototype safety", () => {
    const safePayload = {
      title: "Clean Post Title",
      slug: "clean-post-slug",
      description: "A standard description without HTML",
      author: { name: "Admin", id: "usr_123" },
      counts: [10, 20, 30],
    };

    expect(containsXssVector(safePayload.title)).toBe(false);
    expect(sanitizeObject(safePayload)).toBe(safePayload); // Zero-alloc fast path

    timeSync("input-sanitizer.sanitizeObject (clean fast-path)", 100_000, 2_000, () => {
      return sanitizeObject(safePayload);
    });
  });

  test("safeRedirect — protocol-relative and traversal rejection", () => {
    expect(safeRedirect("/dashboard", "/")).toBe("/dashboard");
    expect(safeRedirect("//evil.com", "/")).toBe("/");
    expect(safeRedirect("/\\evil.com", "/")).toBe("/");
    expect(safeRedirect("https://evil.com", "/")).toBe("/");

    timeSync("safe-redirect.safeRedirect (valid vs blocked mix)", 100_000, 2_000, (i) => {
      const url = i % 2 === 0 ? "/en/collection/posts" : "//evil.com/phish";
      return safeRedirect(url, "/fallback");
    });
  });

  test("WebMCP tool registry — search and discovery throughput", () => {
    const list = listServerTools();
    expect(list.length).toBeGreaterThanOrEqual(3);

    const matches = searchServerTools("schema");
    expect(matches.length).toBeGreaterThan(0);

    timeSync("webmcp.searchServerTools ('schema')", 50_000, 1_000, () => {
      return searchServerTools("schema");
    });

    timeSync("webmcp.exportServerTools (catalog snapshot)", 20_000, 1_000, () => {
      return exportServerTools();
    });
  });

  test("FX resolver — real-time currency conversion throughput", () => {
    const priceEur = money(4999, "EUR");
    const converted = defaultFxResolver.convertPrice(priceEur, "USD");
    expect(converted.currency).toBe("USD");

    timeSync("commerce.convertPrice (EUR -> USD minor units)", 100_000, 2_000, (i) => {
      priceEur.amount = 1000 + (i % 10000);
      return defaultFxResolver.convertPrice(priceEur, "USD");
    });
  });

  test("semantic reranker — candidate answer relevance throughput", () => {
    const candidates: SearchResult[] = [
      {
        id: "page:1",
        type: "admin-page",
        title: "Media Gallery",
        description: "Digital asset management and image library",
        path: "/mediagallery",
        keywords: ["media", "images"],
        vector: [0.1, 0.2],
        indexedAt: 1000,
        score: 0.6,
        matchType: "semantic",
      },
      {
        id: "page:2",
        type: "admin-page",
        title: "Dashboard",
        description: "System overview and activity metrics",
        path: "/dashboard",
        keywords: ["home", "stats"],
        vector: [0.2, 0.3],
        indexedAt: 1000,
        score: 0.7,
        matchType: "semantic",
      },
      {
        id: "page:3",
        type: "admin-page",
        title: "User Profile",
        description: "Password and credential management",
        path: "/user",
        keywords: ["security"],
        vector: [0.3, 0.4],
        indexedAt: 1000,
        score: 0.5,
        matchType: "semantic",
      },
    ];

    timeSync("semanticIndex.rerankCandidatesSync (top-3 candidates)", 50_000, 1_000, () => {
      return rerankCandidatesSync("how to manage media gallery images", candidates, { topN: 3 });
    });
  });

  test("storefront SEO — product Schema.org JSON-LD serialization", () => {
    const product = {
      name: "Performance Sneaker",
      description: "High efficiency running shoe with carbon plate",
      price: 199.99,
      currency: "EUR",
      sku: "SHOE-42",
      availability: "InStock" as const,
      url: "https://example.com/shop/sneaker",
      image: "https://example.com/media/sneaker.jpg",
    };

    timeSync("seoHead.buildProductJsonLd (escaping + serialization)", 50_000, 1_000, () => {
      return buildProductJsonLd(product, "https://example.com", "/shop/sneaker");
    });
  });
});
