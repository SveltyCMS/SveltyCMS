#!/usr/bin/env bun
/**
 * @file scripts/record-cold-warm-benchmarks.ts
 * @description Runs the benchmark suite ONCE against the CURRENT checkout and
 * aggregates Cold & Warm metrics into a structured JSON file.
 *
 * ⚠️ The `target` argument is ONLY an output-filename label. This script does
 * NOT switch code between "base" and "enhanced" — running it twice produces two
 * samples of the SAME code. A meaningful base-vs-enhanced comparison requires
 * running this script at two different git refs (e.g. `git checkout <base>` →
 * run → `git checkout <enhanced>` → run), ideally interleaved A/B/A/B to avoid
 * time/system-state confounds. Do not cite the two JSON files as a real A/B
 * unless they were produced from different commits.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BENCHMARKS_DIR = path.resolve(process.cwd(), "tests/benchmarks");
const RESULTS_DIR = path.resolve(process.cwd(), "tests/benchmarks/results");

export const BENCHMARK_56_TESTS = [
  // Group 1: Core HTTP Read
  "truth-latency.test.ts",
  "rest-api-performance.test.ts",
  "api-latency.test.ts",
  "auth-performance.test.ts",
  "failure-propagation.test.ts",
  "circuit-breaker-failover.test.ts",
  "chaos-resilience.test.ts",

  // Group 2: GraphQL + Cache
  "graphql-api-performance.test.ts",
  "graphql-stress.test.ts",
  "cache-performance.test.ts",
  "cache-hit-ratio.test.ts",
  "negative-cache.test.ts",

  // Group 3: Feature HTTP Read
  "admin-ux-vitality.test.ts",
  "multi-tenant-performance.test.ts",
  "openapi-performance.test.ts",
  "relational-performance.test.ts",
  "seo-performance.test.ts",
  "mixed-workload.test.ts",
  "realtime-performance.test.ts",

  // Group 4: SDK/Local Read
  "local-api-performance.test.ts",
  "entry-edit-hydration.test.ts",
  "widget-performance.test.ts",
  "etag-hash.test.ts",
  "ai-performance.test.ts",
  "telemetry-performance.test.ts",

  // Group 5: HTTP Write/Mutation
  "hooks-performance.test.ts",
  "production-day.test.ts",
  "data-residency-failover.test.ts",
  "temporal-integrity.test.ts",
  "client-journey.test.ts",
  "index-pressure.test.ts",
  "right-to-be-forgotten-audit.test.ts",
  "revision-stress.test.ts",

  // Group 6: SDK Write/Mutation
  "local-api-throughput.test.ts",
  "database-performance.test.ts",
  "transaction-acid.test.ts",
  "security-audit.test.ts",
  "behavioral-learning.test.ts",
  "cache-eviction-leak.test.ts",
  "cache-service.test.ts",
  "database-failover.test.ts",

  // Group 7: Filesystem + Stress
  "content-scan.test.ts",
  "content-incremental-reload.test.ts",
  "content-scale-stress.test.ts",
  "throttling-backoff-stress.test.ts",
  "state-machine-transition.test.ts",
  "media-performance.test.ts",
  "media-upload-stress.test.ts",
  "large-payload-streaming.test.ts",
  "migration-scale.test.ts",
  "concurrency-max.test.ts",
  "concurrency-race.test.ts",
  "concurrency-throughput.test.ts",
  "dev-dependency-load.test.ts",
  "edge-sync.test.ts",
  "websocket-broadcast.test.ts",
];

export interface BenchmarkMetrics {
  testFile: string;
  testName: string;
  coldFirstMs: number;
  coldAvgMs: number;
  coldP95Ms: number;
  warmAvgMs: number;
  warmP95Ms: number;
  warmRps: number;
  status: "pass" | "fail";
}

async function runSingleTest(file: string): Promise<BenchmarkMetrics[]> {
  const filePath = path.join(BENCHMARKS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[Skip] File not found: ${file}`);
    return [];
  }

  const metrics: BenchmarkMetrics[] = [];
  return new Promise((resolve) => {
    const child = spawn("bun", ["test", `tests/benchmarks/${file}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: {
        ...process.env,
        BENCHMARK: "true",
        DB_TYPE: "sqlite",
        BENCHMARK_REDIRECTED: "true",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const isPass = code === 0;
      // Parse output for metrics
      // Format: METRIC: <Name>.cold=<val>ms
      // Format: METRIC: <Name>.warm=<val>ms
      // Format: <Name>: <avg>ms (p95: <p95>ms) [Cold: <cold>ms] · RPS: <rps>
      const metricLines = stdout.split("\n");
      const subMetrics: Record<
        string,
        { cold?: number; warm?: number; p95?: number; rps?: number }
      > = {};

      for (const line of metricLines) {
        const metricMatch = line.match(/^METRIC:\s*([^.]+)\.(cold|warm)=([0-9.]+)ms/);
        if (metricMatch) {
          const [, name, phase, val] = metricMatch;
          if (!subMetrics[name!]) subMetrics[name!] = {};
          if (phase === "cold") subMetrics[name!]!.cold = parseFloat(val!);
          if (phase === "warm") subMetrics[name!]!.warm = parseFloat(val!);
        }

        const summaryMatch = line.match(
          /^\s*([^:]+):\s*([0-9.]+)ms\s*\(p95:\s*([0-9.]+)ms\)(?:\s*\[Cold:\s*([0-9.]+)ms\])?\s*·\s*RPS:\s*([0-9]+)/,
        );
        if (summaryMatch) {
          const [, name, warmAvg, p95, cold, rps] = summaryMatch;
          const trimmed = name!.trim();
          if (!subMetrics[trimmed]) subMetrics[trimmed] = {};
          subMetrics[trimmed]!.warm = parseFloat(warmAvg!);
          subMetrics[trimmed]!.p95 = parseFloat(p95!);
          subMetrics[trimmed]!.rps = parseInt(rps!, 10);
          if (cold) subMetrics[trimmed]!.cold = parseFloat(cold);
        }
      }

      for (const [name, data] of Object.entries(subMetrics)) {
        metrics.push({
          testFile: file,
          testName: name,
          coldFirstMs: data.cold ?? data.warm ?? 0,
          coldAvgMs: data.cold ?? data.warm ?? 0,
          coldP95Ms: data.cold ?? data.warm ?? 0,
          warmAvgMs: data.warm ?? 0,
          warmP95Ms: data.p95 ?? data.warm ?? 0,
          warmRps: data.rps ?? 0,
          status: isPass ? "pass" : "fail",
        });
      }

      if (metrics.length === 0) {
        metrics.push({
          testFile: file,
          testName: file.replace(/\.test\.ts$/, ""),
          coldFirstMs: 0,
          coldAvgMs: 0,
          coldP95Ms: 0,
          warmAvgMs: 0,
          warmP95Ms: 0,
          warmRps: 0,
          status: isPass ? "pass" : "fail",
        });
      }

      resolve(metrics);
    });
  });
}

async function main() {
  const target = process.argv[2] || "run";
  const outputFile = path.join(RESULTS_DIR, `${target}-cold-warm.json`);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log(
    `\n🚀 Recording Benchmark Suite [Run label: ${target.toUpperCase()}] (${BENCHMARK_56_TESTS.length} Tests)...\n`,
  );
  console.log(
    `   ⚠️  This records the CURRENT checkout only. "base" vs "enhanced" is NOT\n` +
      `   a real A/B unless run at two different git refs (see file header).\n`,
  );

  const allMetrics: Record<string, BenchmarkMetrics[]> = {};

  for (let i = 0; i < BENCHMARK_56_TESTS.length; i++) {
    const file = BENCHMARK_56_TESTS[i]!;
    console.log(`\n══════════════════════════════════════════════════════════════`);
    console.log(`[${i + 1}/${BENCHMARK_56_TESTS.length}] Running ${file}...`);
    console.log(`══════════════════════════════════════════════════════════════\n`);

    const res = await runSingleTest(file);
    allMetrics[file] = res;
    fs.writeFileSync(outputFile, JSON.stringify(allMetrics, null, 2));
  }

  console.log(`\n✅ Saved all benchmark metrics to: ${outputFile}\n`);
}

if (import.meta.main) {
  main().catch(console.error);
}
