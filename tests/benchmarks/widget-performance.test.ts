/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description Benchmark for auditing the server-side overhead of Core Widgets.
 * Measures the latency added to the modifyRequest pipeline per widget instance.
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const ITERATIONS = 100;
const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";

async function runWidgetOverheadBenchmark() {
  console.log("\n🚀 SveltyCMS Widget Performance Audit");
  console.log("=====================================");

  const authHeaders = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
  };

  // 1. Create a "Stress Collection" with 20 fields of the same widget type
  async function createStressCollection(widgetType: string) {
    const fields = Array.from({ length: 20 }, (_, i) => ({
      label: `Field ${i}`,
      db_fieldName: `field_${i}`,
      widget: widgetType,
      translated: true,
    }));

    await safeFetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "create-collection",
        name: `Stress${widgetType}`,
        schema: {
          _id: `stress_${widgetType.toLowerCase()}`,
          fields,
        },
      }),
    });
  }

  const widgetsToTest = ["Input", "RichText", "Relation"];
  const overallResults: any[] = [];

  for (const widget of widgetsToTest) {
    await createStressCollection(widget);

    const result = await runBenchmark({
      name: `Widget Overhead: ${widget}`,
      iterations: ITERATIONS,
      silent: true,
      onIteration: async () => {
        // We trigger a 'findMany' which executes the modifyRequest pipeline
        const res = await safeFetch(
          `${API_BASE_URL}/api/collections/stress_${widget.toLowerCase()}`,
          {
            headers: authHeaders,
          },
        );
        if (!res.ok) throw new Error(`Widget Stress Test failed for ${widget}: ${res.status}`);
      },
    });

    overallResults.push(result);
    exportResult(result, `widget-overhead-${widget.toLowerCase()}.json`);
  }

  // --- Summary Matrix ---
  console.log(
    "\n==========================================================================================",
  );
  console.log("🏁  WIDGET PERFORMANCE OVERHEAD MATRIX");
  console.log(
    "==========================================================================================",
  );

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `| ${pad("Widget Type", 20)} | ${pad("Avg Latency", 15)} | ${pad("p95 Latency", 15)} | Status |`,
  );
  console.log(`|${"-".repeat(22)}|${"-".repeat(17)}|${"-".repeat(17)}|--------|`);

  for (const r of overallResults) {
    const avg = r.avgMs.toFixed(2);
    const p95 = r.p95Ms.toFixed(2);
    const status = r.avgMs < 5 ? "✅ PASS" : "⚠️ WARN";
    console.log(
      `| ${pad(r.name.replace("Widget Overhead: ", ""), 20)} | ${pad(avg + " ms", 15)} | ${pad(p95 + " ms", 15)} | ${status} |`,
    );
  }
  console.log(
    "==========================================================================================\n",
  );
}

import { test } from "bun:test";

test("Widget Performance Audit Suite", async () => {
  await runWidgetOverheadBenchmark();
}, 600000);
