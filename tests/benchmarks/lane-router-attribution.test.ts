/**
 * @file tests/benchmarks/lane-router-attribution.test.ts
 * @description
 * Benchmark for Request Lane Router execution latency and header attribution.
 * Measures response time per lane (`x-svelty-lane`) to quantify operational hook cost.
 */

import { describe, expect, test } from "vitest";
import { classifyRequest, RequestLane } from "@src/hooks/handle-request-classifier";

describe("Request Lane Router Attribution Benchmark", () => {
  test("measures O(1) classification latency across 100,000 iterations", () => {
    const faviconUrl = new URL("http://localhost:5173/favicon.ico");
    const healthUrl = new URL("http://localhost:5173/health");
    const dashboardUrl = new URL("http://localhost:5173/dashboard");
    const collectionsUrl = new URL("http://localhost:5173/api/collections/posts");

    const sessionHeaders = new Headers({ cookie: "auth_sessions=xyz123" });
    const emptyHeaders = new Headers();

    const iterations = 100_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      classifyRequest(faviconUrl, "GET", emptyHeaders);
      classifyRequest(healthUrl, "GET", emptyHeaders);
      classifyRequest(dashboardUrl, "GET", sessionHeaders);
      classifyRequest(collectionsUrl, "GET", sessionHeaders);
      classifyRequest(collectionsUrl, "POST", sessionHeaders);
    }

    const elapsedMs = performance.now() - start;
    const opsPerSec = Math.round((iterations * 5) / (elapsedMs / 1000));
    const avgMicroseconds = (elapsedMs / (iterations * 5)) * 1000;

    console.log(`\n⚡ Request Classifier Benchmark:`);
    console.log(`   Total Operations : ${(iterations * 5).toLocaleString()}`);
    console.log(`   Elapsed Time     : ${elapsedMs.toFixed(2)} ms`);
    console.log(`   Average Latency  : ${avgMicroseconds.toFixed(4)} μs per classification`);
    console.log(`   Throughput       : ${opsPerSec.toLocaleString()} ops/sec\n`);

    expect(avgMicroseconds).toBeLessThan(0.5); // < 500 nanoseconds per classification
  });

  test("verifies lane attribution accuracy for admin routes", () => {
    const adminRoutes = [
      "http://localhost:5173/dashboard",
      "http://localhost:5173/config",
      "http://localhost:5173/mediagallery",
      "http://localhost:5173/user",
      "http://localhost:5173/en/dashboard",
      "http://localhost:5173/de/settings",
    ];

    const headers = new Headers();

    for (const route of adminRoutes) {
      const lane = classifyRequest(new URL(route), "GET", headers);
      expect(lane).toBe(RequestLane.APP_SSR);
    }
  });
});
