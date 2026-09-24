/**
 * @file tests/benchmarks/probe-write-split.test.ts
 * @description Write-lane phase decomposition + cold-session auth price.
 * @summary create/update at 8c with `x-srv-split` phases (security/parse/schema/
 * prep/encrypt/dbwrite/postwrite/persist/serve) + `x-srv-dur`, plus the
 * first-request-after-login cost vs a warm turbo-session read.
 *
 * ### Features:
 * - Runs against a shared server started with SVELTY_SRV_SPLIT=1 + SVELTY_SRV_DUR=1
 * - Phase buckets (create + update + srv-dur) report p50/avg/p95/p99/p999
 * - Namespace sub-phases (schema/prep/encrypt/dbwrite/postwrite) attribute the
 *   SDK-side work inside the persist phase
 * - Cold-session delta: first point read after a fresh login (full session
 *   validation) vs the warm turbo-served read — the real per-session auth price
 */
import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
  getDbType,
} from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const ITERS = Number(process.env.SPLIT_ITERS || 150);

function parseSplit(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const ms = Number(part.slice(eq + 1));
    if (Number.isFinite(ms)) out[part.slice(0, eq)] = ms;
  }
  return out;
}

test("write-lane split + cold-session auth price", async () => {
  // Propagated to the spawned server via ...process.env (setupBenchmarkServer).
  process.env.SVELTY_SRV_SPLIT = "1";
  process.env.SVELTY_SRV_DUR = "1";

  let stop: (() => Promise<void>) | null = null;
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;

    const createdIds: string[] = [];
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: 2_000,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `write probe ${i}`,
        slug: `write-probe-${Date.now()}-${i}`,
        status: "published",
        count: i,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "write probe",
      }),
      existing: createdIds,
    });

    // ── Cold-session auth price: fresh login → first read vs warm turbo read ──
    const loginHeaders = {
      "content-type": "application/json",
      "x-test-security": "true",
      "x-test-secret": "SVELTYCMS_TEST_SECRET_2026",
      "x-forwarded-for": "127.0.0.1",
      origin: baseUrl,
    };
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: loginHeaders,
      body: JSON.stringify({ email: "admin@example.com", password: "Admin123!" }),
    });
    if (!login.ok) throw new Error(`login ${login.status}`);
    const coldCookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const coldReadHeaders = { ...loginHeaders, cookie: coldCookie };

    const firstRead = performance.now();
    const r1 = await fetch(`${collectionUrl}/${createdIds[0]}`, { headers: coldReadHeaders });
    await r1.text();
    const firstReadMs = performance.now() - firstRead;

    const warmSamples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const r = await fetch(`${collectionUrl}/${createdIds[0]}`, { headers: coldReadHeaders });
      await r.text();
      warmSamples.push(performance.now() - t0);
    }
    const warmAvg = warmSamples.reduce((a, b) => a + b, 0) / warmSamples.length;
    console.log(
      `\nCOLD-SESSION AUTH: first read after fresh login ${firstReadMs.toFixed(1)}ms | warm turbo read ${warmAvg.toFixed(2)}ms | per-session auth price ≈ ${(firstReadMs - warmAvg).toFixed(1)}ms`,
    );

    // ── Write phases at 8c ──
    let n = 0;
    const create = async () => {
      const res = await fetch(collectionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "split probe",
          slug: `split-probe-${Date.now()}-${n++}`,
          status: "draft",
          count: 0,
          publishDate: "2026-01-01T00:00:00.000Z",
          content: "split probe",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const split = parseSplit(res.headers.get("x-srv-split"));
      (globalThis as any).__lastCreateSplit = split;
      const dur = parseFloat(res.headers.get("x-srv-dur") || "");
      if (Number.isFinite(dur)) (globalThis as any).__lastCreateDur = dur;
      await res.arrayBuffer();
    };
    const update = async () => {
      const id = createdIds[Math.floor(Math.random() * createdIds.length)];
      const res = await fetch(`${collectionUrl}/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ count: Math.floor(Math.random() * 1000) + 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const split = parseSplit(res.headers.get("x-srv-split"));
      (globalThis as any).__lastUpdateSplit = split;
      const dur = parseFloat(res.headers.get("x-srv-dur") || "");
      if (Number.isFinite(dur)) (globalThis as any).__lastUpdateDur = dur;
      await res.arrayBuffer();
    };

    const collect = async (name: string, fn: () => Promise<void>) => {
      for (let i = 0; i < 30; i++) await fn();
      const buckets: Record<string, number[]> = {
        security: [],
        parse: [],
        schema: [],
        prep: [],
        encrypt: [],
        dbwrite: [],
        postwrite: [],
        persist: [],
        serve: [],
        srvDur: [],
      };
      const t0 = performance.now();
      let count = 0;
      const workers = Array.from({ length: 8 }, async () => {
        for (let i = 0; i < ITERS / 8; i++) {
          await fn();
          count++;
          const split = (globalThis as any)[
            name === "create" ? "__lastCreateSplit" : "__lastUpdateSplit"
          ];
          if (split) {
            for (const k of Object.keys(buckets)) {
              const v = split[k];
              if (Number.isFinite(v)) buckets[k].push(v);
            }
            const dur = (globalThis as any)[
              name === "create" ? "__lastCreateDur" : "__lastUpdateDur"
            ];
            if (Number.isFinite(dur)) buckets.srvDur.push(dur);
          }
        }
      });
      await Promise.all(workers);
      const wall = performance.now() - t0;
      const pct = (arr: number[], p: number) => {
        const s = [...arr].sort((a, b) => a - b);
        if (s.length === 0) return 0;
        const idx = (p / 100) * (s.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return lo === hi ? s[lo] : s[lo] * (1 - (idx - lo)) + s[hi] * (idx - lo);
      };
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
      const fmt = (arr: number[]) =>
        arr.length
          ? `p50 ${pct(arr, 50).toFixed(3)}ms avg ${avg(arr).toFixed(3)}ms p95 ${pct(arr, 95).toFixed(3)}ms p99 ${pct(arr, 99).toFixed(3)}ms p999 ${pct(arr, 99.9).toFixed(3)}ms`
          : "—";
      console.log(
        `${name.padEnd(8)} ${Math.round((count / wall) * 1000)
          .toLocaleString()
          .padStart(6)} RPS | srv-dur ${fmt(buckets.srvDur)}`,
      );
      for (const k of [
        "security",
        "parse",
        "schema",
        "prep",
        "encrypt",
        "dbwrite",
        "postwrite",
        "persist",
        "serve",
      ]) {
        console.log(`          ${k.padEnd(10)} ${fmt(buckets[k])}`);
      }
    };

    console.log("\n=== WRITE-LANE SPLIT (8c) ===");
    await collect("create", create);
    await collect("update", update);

    // Control: the read lane split for comparison (hot point read).
    const read = async () => {
      const res = await fetch(`${collectionUrl}/${createdIds[0]}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    for (let i = 0; i < 20; i++) await read();
    const readBench = await runBenchmark({
      name: "hot point read (control)",
      warmupIterations: 0,
      iterations: ITERS,
      concurrency: 8,
      onIteration: read,
    });
    console.log(
      `read   ${Math.round(readBench.rps).toLocaleString().padStart(6)} RPS (turbo hit control, ${getDbType()})`,
    );
  } finally {
    if (stop) await stop();
  }
}, 600_000);
