/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Authentication & RBAC Pipeline Benchmark (Production Optimized)
 * @summary Evaluates authenticated session resolution, RBAC evaluation, and rejection paths.
 *
 * The three rejection rows isolate the three credential surfaces, so a regression on
 * one path cannot hide behind the others:
 * - no credentials at all            → session branch skipped, RBAC 401
 * - unknown session cookie           → session lookup + negative cache + RBAC 401
 * - unknown API key (`Bearer sck_…`) → HMAC + key lookup + negative cache + RBAC 401
 *
 * ⚠️ The rows are NOT equal work, and the summary says so per row (live lane/cache
 * + hook-count capture, never hardcoded):
 * - `Auth Validation @ 1c` (`/api/user/me`) is served by the turbo response cache
 *   (`X-Cache: TURBO-HIT`) — turbo-get short-circuits compression/authentication/
 *   authorization/local-context/api-requests/token-resolution, so its row is NOT a
 *   like-for-like partner for a rejection (which must run the full chain to reach
 *   its 401). Never quote it as "the authenticated cost of the same work".
 * - `Auth (full chain) @ 1c` is the authenticated reference that IS the same work:
 *   same session cookie, but a path the turbo cache never serves.
 *
 * With `ENABLE_HOOK_TIMING=1` on the benchmark server the reject/auth phases are also
 * attributed per middleware hook (via `/api/system/health?verbose`), which is what
 * turns an unexplained row delta into an owned cost.
 */

import { randomUUID } from "node:crypto";
import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  benchmarkAuthHeaders,
  getDbType,
  hookPhaseCost,
  readHookTimings,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

/**
 * Live context label for one row: lane · cache · how many middleware hooks ran.
 *
 * 🔍 Truthfulness guard for the ledger — captured from the server, never
 * hardcoded:
 * - `x-svelty-lane` (`hooks.server.ts` lane router)
 * - `x-cache` (turbo/route cache state; absent ⇒ the response was not cached)
 * - hook count for THAT single request (`ENABLE_HOOK_TIMING=1` snapshots around
 *   it; the health snapshot itself is served by the terminal health bypass, so
 *   it does not pollute the count). A turbo-served GET shows 4 hooks, a full
 *   chain 10 — which is exactly why an auth row must not be quoted against a
 *   rejection row without this labelling.
 */
async function captureRowContext(
  baseUrl: string,
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const before = await readHookTimings(baseUrl);
  const res = await fetch(url, { method: "GET", headers });
  await res.arrayBuffer().catch(() => {});
  const after = await readHookTimings(baseUrl);
  const lane = res.headers.get("x-svelty-lane") ?? "unknown-lane";
  const cache = res.headers.get("x-cache") ?? "uncached";
  const hooks = hookPhaseCost(before, after).length;
  const chain = hooks > 0 ? `${hooks} hooks` : "n/a";
  return `${lane} · ${cache} · ${chain}`;
}

/**
 * Warms every credential surface outside any measured row.
 *
 * 🛡️ AGENTS.md §4 ("perf assertions need JIT warm-up"): the reject rows run first,
 * right after the seeded boot, where lazy hook modules + V8 compile would otherwise
 * land INSIDE the timed loop.
 *
 * It does NOT remove the residual reject:auth asymmetry — measured warm on
 * 2026-09-22 the reject rows were still 0.84-1.00 ms against 0.40 ms for auth.
 * That was attributed and fixed the same day: the production 401/403 fast-path
 * envelopes were the only API responses without a `content-length`, so
 * `handleCompression` treated them as "unknown size", skipped both the <1 KiB
 * skip-gate and the buffered tier, and negotiated the streaming tier — a fresh
 * zstd stream per reject (~0.45 ms for a 64-byte body; `Accept-Encoding: identity`
 * restored the cheap path, which is what identified it). With the envelope
 * declaring its length the reject rows land at ~0.38-0.42 ms, on par with the
 * authenticated rows. The remaining row delta vs `Auth Validation @ 1c` is the
 * turbo cache short-circuit (`Auth (full chain) @ 1c` is the like-for-like row).
 */
async function warmCredentialSurfaces(
  url: string,
  headersList: Record<string, string>[],
  rounds = 120,
): Promise<void> {
  for (let r = 0; r < rounds; r++) {
    for (const headers of headersList) {
      const res = await fetch(url, { method: "GET", headers }).catch(() => null);
      if (res) await res.arrayBuffer().catch(() => {});
    }
  }
}

async function runAuthAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Auth & RBAC Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await stabilize(500);

    const targetUrl = `${baseUrl}/api/user/me`;

    // Static plain record headers to eliminate runtime prototype lookups
    const authHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    const unauthHeaders: Record<string, string> = {
      "content-type": "application/json",
      connection: "keep-alive",
    };

    // Credential-surface variants: same URL, one *unknown* session cookie vs one
    // *unknown* API key. Both must reject, but they pay different work — the cookie
    // hits the session lookup + negative cache, the key pays HMAC-SHA-256
    // (hashApiKey) + the key lookup + the key negative cache.
    const cookieRejectHeaders: Record<string, string> = {
      ...unauthHeaders,
      Cookie: `auth_sessions=${randomUUID()}`,
    };
    const badKeyHeaders: Record<string, string> = {
      ...unauthHeaders,
      Authorization: `Bearer sck_${randomUUID().replace(/-/g, "")}`,
    };

    // Verify authenticated endpoint baseline before timing loop
    const verifyRes = await fetch(targetUrl, { headers: authHeaders });
    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => "");
      throw new Error(`Auth benchmark baseline failed: HTTP ${verifyRes.status} ${errText}`);
    }
    await verifyRes.arrayBuffer().catch(() => {});

    // Warm-up phase (never measured): JIT + lazy hook modules for every credential
    // surface, so row 1 is not paying for the whole server's first requests.
    console.log("   → Warming credential surfaces (rejected: not measured)...");
    await warmCredentialSurfaces(targetUrl, [
      unauthHeaders,
      cookieRejectHeaders,
      badKeyHeaders,
      authHeaders,
    ]);
    await stabilize(300);

    const results = [];

    // Phase boundary for the per-hook attribution below (no-op when the server was
    // started without ENABLE_HOOK_TIMING=1).
    const timingsBefore = await readHookTimings(baseUrl);

    // ── 1. UNAUTHENTICATED REJECTION BASELINE (401 reject) ────────────────
    console.log("   → Measuring Unauthenticated Rejection (401 reject)...");
    const unauthResult = await runBenchmark({
      name: "Unauthenticated (401 reject)",
      iterations: 400,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: unauthHeaders,
        });
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`Expected 401/403 rejection, got HTTP ${res.status}`);
        }
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...unauthResult, layer: "Security", shortLabel: "Reject-401" });

    // ── 1b. REJECTION: unknown session cookie ───────────────────────────────
    console.log("   → Measuring Rejection with unknown session cookie...");
    const cookieRejectResult = await runBenchmark({
      name: "Reject: unknown session cookie",
      iterations: 300,
      warmupIterations: 40,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, { method: "GET", headers: cookieRejectHeaders });
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`Expected 401/403 rejection, got HTTP ${res.status}`);
        }
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...cookieRejectResult, layer: "Security", shortLabel: "Reject-Cookie" });

    // ── 1c. REJECTION: unknown API key ──────────────────────────────────────
    console.log("   → Measuring Rejection with unknown API key...");
    const badKeyResult = await runBenchmark({
      name: "Reject: unknown API key (Bearer sck_)",
      iterations: 300,
      warmupIterations: 40,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, { method: "GET", headers: badKeyHeaders });
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`Expected 401/403 rejection, got HTTP ${res.status}`);
        }
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...badKeyResult, layer: "Security", shortLabel: "Reject-ApiKey" });

    const timingsAfterReject = await readHookTimings(baseUrl);

    // ── 2. AUTH VALIDATION & RBAC (1 Concurrent) ────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → Measuring Auth Validation & RBAC (1c)...");
    const lightResult = await runBenchmark({
      name: "Auth Validation @ 1c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...lightResult, layer: "Auth", shortLabel: "Auth-1c" });

    const timingsAfterAuth = await readHookTimings(baseUrl);

    // ── 3. AUTH PIPELINE (8 Concurrent Stress) ──────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → Measuring HTTP Auth Pipeline @ 8c concurrency...");
    const httpResult = await runBenchmark({
      name: "HTTP Auth Pipeline @ 8c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...httpResult, layer: "Auth", shortLabel: "Auth-8c" });

    // ── 3b. AUTH (FULL CHAIN, NO TURBO) — the like-for-like reference ────────
    // `/api/user/me` above is turbo-served, so it skips 6 of the 10 hooks. An
    // authenticated request the turbo cache never serves measures the same work a
    // rejection does (`X-Cache: CONTENT-ETAG` is the route's own body cache, the
    // middleware chain still runs end to end). Without this row the ledger would
    // compare a cache hit against a full chain and call the difference a defect.
    // Measured LAST so the established Auth-1c/8c rows keep their conditions.
    forceGarbageCollection();
    await stabilize(200);

    const fullChainUrl = `${baseUrl}/api/system/version`;
    console.log("   → Measuring Auth (full chain, no turbo) @ 1c...");
    const fullChainResult = await runBenchmark({
      name: "Auth (full chain) @ 1c",
      iterations: 400,
      warmupIterations: 60,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(fullChainUrl, {
          method: "GET",
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`Full-chain auth failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...fullChainResult, layer: "Auth", shortLabel: "Auth-FullChain" });

    // ── REPORTING & EXPORT ──────────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — AUTHENTICATION TELEMETRY",
      shortLabel: "Auth",
      subtitle: `Session Verification • RBAC Resolution • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database", val: dbType, unit: "" },
        {
          key: "401 Reject Latency (no credentials)",
          val: unauthResult.avgMs.toFixed(2),
          unit: "ms",
        },
        {
          key: "401 Reject Latency (unknown cookie)",
          val: cookieRejectResult.avgMs.toFixed(2),
          unit: "ms",
        },
        { key: "401 Reject Latency (unknown key)", val: badKeyResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Auth Latency (1c)", val: lightResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Auth Latency (1c, full chain)",
          val: fullChainResult.avgMs.toFixed(2),
          unit: "ms",
        },
        { key: "Auth Pipeline Latency (8c)", val: httpResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Peak Auth RPS (8c)", val: Math.round(httpResult.rps), unit: "req/s" },
        { key: "Memory RSS Δ (8c)", val: (httpResult.rssDelta ?? 0).toFixed(2), unit: "MB" },
      ],
      "Auth Performance Summary",
    );

    // ── HOOK ATTRIBUTION (ENABLE_HOOK_TIMING=1) ──────────────────────────────
    // Turns a row delta into named middleware costs — the per-hook counters come
    // from the server's own diagnostics, so this attribution costs nothing when the
    // flag is off. Read the spans as nested (outer ⊇ inner), see server-hooks.mdx.
    const rejectHooks = hookPhaseCost(timingsBefore, timingsAfterReject);
    const authHooks = hookPhaseCost(timingsAfterReject, timingsAfterAuth);
    const attribution: { key: string; val: string | number; unit: string }[] = [];
    if (rejectHooks.length === 0 && authHooks.length === 0) {
      attribution.push({
        key: "Hook timing",
        val: "unavailable — start the server with ENABLE_HOOK_TIMING=1",
        unit: "",
      });
    } else {
      for (const r of rejectHooks.slice(0, 4)) {
        attribution.push({ key: `reject · ${r.hook}`, val: r.usPerReq.toFixed(1), unit: "µs/req" });
      }
      for (const r of authHooks.slice(0, 4)) {
        attribution.push({ key: `auth · ${r.hook}`, val: r.usPerReq.toFixed(1), unit: "µs/req" });
      }
    }
    printSummaryTable(attribution, "Auth Hook Attribution (per middleware stage)");

    // ── ROW CONTEXT (lane · cache · hooks) ───────────────────────────────────
    // Printed for the ledger so no row can be read as "the same work, but 2×".
    const rowContext: { key: string; val: string; unit: string }[] = [];
    const annotate = async (
      label: string,
      url: string,
      headers: Record<string, string>,
    ): Promise<void> => {
      rowContext.push({
        key: label,
        val: await captureRowContext(baseUrl, url, headers),
        unit: "",
      });
    };
    await annotate("Reject-401", targetUrl, unauthHeaders);
    await annotate("Reject-Cookie", targetUrl, cookieRejectHeaders);
    await annotate("Reject-ApiKey", targetUrl, badKeyHeaders);
    await annotate("Auth-1c (turbo-served)", targetUrl, authHeaders);
    await annotate("Auth-FullChain-1c", fullChainUrl, authHeaders);
    printSummaryTable(rowContext, "Auth");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Auth audit failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthAudit();
}, 450_000);
