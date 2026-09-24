/**
 * @file tests/benchmarks/probe-write-split.test.ts
 * @description Write-lane phase decomposition + cold-session auth price.
 * @summary create/update at 8c with `x-srv-split` phases (security/persist/serve),
 * plus the first-request-after-login cost vs a warm turbo-session read.
 *
 * ### Features:
 * - Runs against a shared server started with SVELTY_SRV_SPLIT=1
 * - Phase p50s per write lane (security = WAF+CSRF+session+tenant)
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
      await res.arrayBuffer();
    };

    const collect = async (name: string, fn: () => Promise<void>) => {
      for (let i = 0; i < 30; i++) await fn();
      const buckets: Record<string, number[]> = { security: [], persist: [], serve: [] };
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
          }
        }
      });
      await Promise.all(workers);
      const wall = performance.now() - t0;
      const p50 = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)] ?? 0;
      };
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
      console.log(
        `${name.padEnd(8)} ${Math.round((count / wall) * 1000)
          .toLocaleString()
          .padStart(6)} RPS | ` +
          `security p50 ${p50(buckets.security).toFixed(3)}ms avg ${avg(buckets.security).toFixed(3)} | ` +
          `persist p50 ${p50(buckets.persist).toFixed(3)}ms avg ${avg(buckets.persist).toFixed(3)} | ` +
          `serve p50 ${p50(buckets.serve).toFixed(3)}ms avg ${avg(buckets.serve).toFixed(3)}`,
      );
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
