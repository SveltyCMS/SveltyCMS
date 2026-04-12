/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description Professional benchmark for SveltyCMS Core Widget overhead.
 * Measures the modifyRequest pipeline cost when using different widgets (Input, RichText, Relation, etc.).
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";

const authHeaders = {
  "Content-Type": "application/json",
  "x-test-secret": TEST_API_SECRET,
};

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 25));
}

test("Widget Performance Audit Suite", async () => {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  const widgetsToTest = ["Input", "RichText", "Relation", "Select", "DateTime"];

  // Pre-create stress collections (once, outside benchmark loop)
  console.log("🛠️ Preparing stress collections with 20 fields each...");
  for (const widget of widgetsToTest) {
    const collectionId = `stress_${widget.toLowerCase()}`;

    await safeFetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "create-collection",
        name: `Stress${widget}`,
        schema: {
          _id: collectionId,
          fields: Array.from({ length: 20 }, (_, i) => ({
            label: `Field ${i + 1}`,
            db_fieldName: `field_${i}`,
            widget,
            translated: widget !== "Relation", // Relations are usually not translated
          })),
        },
      }),
    }).catch((err) => {
      console.warn(`Collection ${collectionId} creation skipped or already exists:`, err.message);
    });
  }

  await stabilize();

  const ITERATIONS = 600;
  const WARMUP = 80;
  const results: any[] = [];

  for (const widget of widgetsToTest) {
    const collectionId = `stress_${widget.toLowerCase()}`;

    console.log(`📊 Benchmarking widget: ${widget} (20 fields)`);

    const result = await runBenchmark({
      name: `Widget Overhead: ${widget} (20 fields)`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 8,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/collections/${collectionId}?limit=10`, {
          headers: authHeaders,
        });

        if (!res.ok) {
          throw new Error(`Widget stress test failed for ${widget}: HTTP ${res.status}`);
        }

        await res.text(); // consume body to simulate real usage
      },
    });

    results.push(result);
    exportResult(result, `widget-overhead-${widget.toLowerCase()}.json`);

    await stabilize();
  }

  // ========================
  // Professional Summary
  // ========================
  console.log("\n" + "=".repeat(95));
  console.log("🏁 WIDGET PERFORMANCE OVERHEAD MATRIX");
  console.log("=".repeat(95));

  console.log(
    `| ${"Widget Type".padEnd(22)} | ${"Avg (ms)".padEnd(12)} | ${"p95 (ms)".padEnd(12)} | ${"RPS".padEnd(12)} | Status     |`,
  );
  console.log("|" + "-".repeat(22 + 12 + 12 + 12 + 12 + 4) + "|");

  for (const r of results) {
    const widgetName = r.name.replace("Widget Overhead: ", "").replace(" (20 fields)", "");
    const avg = r.avgMs.toFixed(3);
    const p95 = r.p95Ms.toFixed(3);
    const rps = Math.round(r.rps).toLocaleString();
    const status = r.avgMs < 8 ? "✅ GOOD" : r.avgMs < 15 ? "⚠️ ACCEPTABLE" : "❌ HIGH";

    console.log(
      `| ${widgetName.padEnd(22)} | ${avg.padEnd(12)} | ${p95.padEnd(12)} | ${rps.padEnd(12)} | ${status.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(95));

  console.log("\nInterpretation:");
  console.log("• < 8 ms  → Excellent widget performance");
  console.log("• 8–15 ms → Acceptable (common with heavy widgets like RichText)");
  console.log("• > 15 ms → Investigate widget implementation or modifyRequest hooks");
}, 600000);
