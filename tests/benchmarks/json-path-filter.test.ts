/**
 * @file tests/benchmarks/json-path-filter.test.ts
 * @description JSON-path filter matcher micro-benchmark.
 *
 * The media gallery filters its result set in-process with
 * `matchesJsonPathFilter` (`mediagallery/+page.server.ts`), so the per-item cost
 * is paid once per candidate row on every filtered gallery read. This benchmark
 * pins that cost for `eq`, range and `contains` clauses.
 */

import {
  test,
  runBenchmark,
  exportResult,
  printTruthTable,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { matchesJsonPathFilter } from "@utils/json-path-filter";

const ITEM_COUNT = 20_000;

/** One in a thousand matches, the rest are same-shape misses. */
const ITEMS = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  _id: String(i),
  title: `Photo ${i}`,
  metadata: {
    camera: i % 1000 === 0 ? "Canon EOS 5D" : "Nikon Z6",
    exif: { iso: 100 + (i % 800), lens: "24-70mm" },
  },
}));

const SCENARIOS = [
  { name: "JSON Path (eq)", expression: 'metadata.camera="Canon EOS 5D"' },
  { name: "JSON Path (range)", expression: "metadata.exif.iso>=400" },
  { name: "JSON Path (contains)", expression: 'metadata.exif.lens~"24"' },
] as const;

async function runJsonPathFilterBenchmark(): Promise<void> {
  console.log("🚀 Starting JSON-path filter matcher benchmark...\n");

  // Warm the compiled-plan cache (one compile per expression) and the JIT.
  for (const scenario of SCENARIOS) {
    matchesJsonPathFilter(ITEMS[0], scenario.expression);
  }
  await stabilize(100);

  const results = [];

  for (const scenario of SCENARIOS) {
    const result = await runBenchmark({
      name: scenario.name,
      iterations: 40,
      warmupIterations: 5,
      runs: 3,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        let hits = 0;
        for (let i = 0; i < ITEMS.length; i++) {
          if (matchesJsonPathFilter(ITEMS[i], scenario.expression)) hits++;
        }
        if (hits === 0) throw new Error(`no matches for ${scenario.expression}`);
      },
    });

    results.push({ ...result, layer: "Core" });
    exportResult({ ...result, shortLabel: "JSON Path" });
  }

  printTruthTable({
    title: "SVELTYCMS — JSON PATH FILTER",
    shortLabel: "JSON Path",
    subtitle: `In-process media filter • ${ITEM_COUNT.toLocaleString()} items per pass`,
    results,
  });
}

test("JSON Path Filter Matcher", async () => {
  await runJsonPathFilterBenchmark();
}, 180_000);
