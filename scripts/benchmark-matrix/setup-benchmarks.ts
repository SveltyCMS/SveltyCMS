#!/usr/bin/env bun
/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Seeds benchmark data via a single LocalCMS-powered API call.
 *
 * The heavy lifting (collection creation + data seeding) happens inside the
 * benchmark server process using LocalCMS for zero-latency writes.
 * This script is just a thin HTTP trigger that hits the benchmark-seed action.
 */

export const AUTHOR_COUNT = Number(process.env.AUTHOR_COUNT ?? 10);
export const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 5);
export const TENANT_ID = process.env.TENANT_ID || "default";

const API_BASE = process.env.API_BASE_URL!;
const SECRET = process.env.TEST_API_SECRET!;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[\x1b[90m${ts}\x1b[0m] ${msg}`);
}

function headers(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    "x-test-secret": SECRET,
    "x-tenant-id": TENANT_ID,
    ...extra,
  };
}

async function waitForServer(maxRetries = 8): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        headers: headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status === 401 || res.status === 403) return;
    } catch {
      // Not ready yet
    }
    const wait = Math.min(1000 * 2 ** i, 8000);
    log(`   ⏳ Server not ready, retrying in ${wait}ms (attempt ${i + 1}/${maxRetries})...`);
    await delay(wait);
  }
  throw new Error(`Server at ${API_BASE} not reachable after ${maxRetries} attempts`);
}

async function smartCheck(): Promise<boolean> {
  try {
    const sig = () => AbortSignal.timeout(15000);
    const [checkAuthor, checkStable, checkRedirect] = await Promise.all([
      fetch(`${API_BASE}/api/collections/benchmark_authors/author-1`, {
        headers: headers(),
        signal: sig(),
      }),
      fetch(`${API_BASE}/api/collections/BenchmarkStable/bench-shared-001`, {
        headers: headers(),
        signal: sig(),
      }),
      fetch(`${API_BASE}/api/collections/redirects/bench-redirect-1`, {
        headers: headers(),
        signal: sig(),
      }),
    ]);

    if (checkAuthor.ok && checkStable.ok && checkRedirect.ok) {
      const authorJson = await checkAuthor.json().catch(() => ({}));
      const stableJson = await checkStable.json().catch(() => ({}));
      const redirectJson = await checkRedirect.json().catch(() => ({}));

      return (
        authorJson.success &&
        authorJson.data?._id === "author-1" &&
        stableJson.success &&
        stableJson.data?._id === "bench-shared-001" &&
        redirectJson.success &&
        redirectJson.data?._id === "bench-redirect-1"
      );
    }
  } catch (e: any) {
    log(`   ⚠️ SmartSeed check error: ${e.message}`);
  }
  return false;
}

async function main(): Promise<void> {
  try {
    if (!API_BASE || !SECRET) {
      log("❌ API_BASE_URL and TEST_API_SECRET required. Run via setupBenchmarkServer().");
      process.exit(1);
    }

    log(`🚀 Benchmark data seeding via LocalCMS: ${API_BASE}`);

    // Wait for the server to be fully up before any requests
    await waitForServer();

    // Smart check: skip seeding if data already exists
    if (await smartCheck()) {
      log("🚀 [SmartSeed] Benchmark data already exists. Reusing state...");
      process.exit(0);
    }

    // Single call — all seeding runs inside the server using LocalCMS
    log("   → Seeding benchmark data (collections + entries via LocalCMS)...");
    const res = await fetch(`${API_BASE}/api/testing`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        action: "benchmark-seed",
        authorCount: AUTHOR_COUNT,
        postsPerAuthor: POSTS_PER_AUTHOR,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Benchmark seed failed: ${res.status} — ${body}`);
    }

    const result = await res.json();
    log(`✅ ${result.message}`);

    process.exit(0);
  } catch (err: any) {
    console.error("❌ Benchmark setup failed:", err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
