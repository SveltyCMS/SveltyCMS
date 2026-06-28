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

export interface BenchmarkSeedOptions {
  apiBase?: string;
  secret?: string;
  tenantId?: string;
  authorCount?: number;
  postsPerAuthor?: number;
  maxServerRetries?: number;
}

export interface BenchmarkSeedResult {
  reused: boolean;
  message: string;
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[\x1b[90m${ts}\x1b[0m] ${msg}`);
}

function seedHeaders(
  secret: string,
  tenantId: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-test-secret": secret,
    "x-test-mode": "true",
    "x-tenant-id": tenantId,
    ...extra,
  };
}

async function waitForServer(
  apiBase: string,
  secret: string,
  tenantId: string,
  maxRetries = 8,
): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${apiBase}/api/health`, {
        headers: seedHeaders(secret, tenantId),
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
  throw new Error(`Server at ${apiBase} not reachable after ${maxRetries} attempts`);
}

export async function isBenchmarkSeedReady(
  apiBase: string,
  secret: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const sig = () => AbortSignal.timeout(15000);
    const hdrs = seedHeaders(secret, tenantId);
    const [checkAuthor, checkStable, checkRedirect] = await Promise.all([
      fetch(`${apiBase}/api/collections/benchmark_authors/author-1`, {
        headers: hdrs,
        signal: sig(),
      }),
      fetch(`${apiBase}/api/collections/BenchmarkStable/bench-shared-001`, {
        headers: hdrs,
        signal: sig(),
      }),
      fetch(`${apiBase}/api/collections/redirects/bench-redirect-1`, {
        headers: hdrs,
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

/**
 * Polls until bench-shared-001 is readable and writable via the API layer.
 * Direct DB writes from the test process do not satisfy this — PATCH must succeed.
 */
export async function waitForStableEntryReady(
  apiBase: string,
  secret: string,
  tenantId = "global",
  maxRetries = 30,
): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const hdrs = seedHeaders(secret, tenantId);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const getRes = await fetch(
        `${apiBase}/api/collections/BenchmarkStable/bench-shared-001?bypassCache=true`,
        { headers: hdrs, signal: AbortSignal.timeout(10000) },
      );
      if (!getRes.ok) {
        await delay(Math.min(250 * (i + 1), 2000));
        continue;
      }
      const getJson = await getRes.json().catch(() => ({}));
      if (!getJson.success || getJson.data?._id !== "bench-shared-001") {
        await delay(Math.min(250 * (i + 1), 2000));
        continue;
      }

      const patchRes = await fetch(`${apiBase}/api/collections/BenchmarkStable/bench-shared-001`, {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({
          title: getJson.data?.title ?? "Stable Benchmark Entry",
          content: getJson.data?.content ?? "Stable entry.",
          count: getJson.data?.count ?? 0,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (patchRes.ok) return;
    } catch {
      /* retry */
    }
    await delay(Math.min(250 * (i + 1), 2000));
  }

  throw new Error(
    `bench-shared-001 not ready for PATCH on ${apiBase} after ${maxRetries} attempts`,
  );
}

/** Seeds benchmark data and blocks until the API layer can read + patch the stable entry. */
export async function runBenchmarkSeed(
  options: BenchmarkSeedOptions = {},
): Promise<BenchmarkSeedResult> {
  const apiBase = options.apiBase ?? process.env.API_BASE_URL;
  const secret = options.secret ?? process.env.TEST_API_SECRET;
  const tenantId = options.tenantId ?? process.env.TENANT_ID ?? "global";
  const authorCount = options.authorCount ?? AUTHOR_COUNT;
  const postsPerAuthor = options.postsPerAuthor ?? POSTS_PER_AUTHOR;

  if (!apiBase || !secret) {
    throw new Error("API_BASE_URL and TEST_API_SECRET required. Run via setupBenchmarkServer().");
  }

  log(`🚀 Benchmark data seeding via LocalCMS: ${apiBase}`);
  await waitForServer(apiBase, secret, tenantId, options.maxServerRetries);

  if (await isBenchmarkSeedReady(apiBase, secret, tenantId)) {
    log("🚀 [SmartSeed] Benchmark data already exists. Reusing state...");
    await waitForStableEntryReady(apiBase, secret, tenantId);
    return { reused: true, message: "Benchmark data already exists" };
  }

  log("   → Seeding benchmark data (collections + entries via LocalCMS)...");
  const res = await fetch(`${apiBase}/api/testing`, {
    method: "POST",
    headers: seedHeaders(secret, tenantId),
    body: JSON.stringify({
      action: "benchmark-seed",
      authorCount,
      postsPerAuthor,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Benchmark seed failed: ${res.status} — ${body}`);
  }

  const result = await res.json();
  log(`✅ ${result.message}`);

  // Sync content store inside the server (no rebuild required for this path)
  await fetch(`${apiBase}/api/content/collections`, {
    headers: seedHeaders(secret, tenantId),
    signal: AbortSignal.timeout(30000),
  }).catch(() => {});

  await waitForStableEntryReady(apiBase, secret, tenantId);
  return { reused: false, message: result.message ?? "Benchmark data seeded" };
}

async function main(): Promise<void> {
  try {
    await runBenchmarkSeed();
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Benchmark setup failed:", err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
