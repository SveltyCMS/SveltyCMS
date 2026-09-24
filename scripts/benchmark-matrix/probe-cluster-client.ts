/**
 * @file scripts/benchmark-matrix/probe-cluster-client.ts
 * @description Load-generator child for probe-cluster-scaling.ts.
 * @summary Runs the login/seed/measure workload in a FORKED process so the
 * load never shares an event loop with the cluster primary or a server worker
 * (an in-primary undici loop measured 12 requests/10s on Windows — a libuv/
 * cluster interaction — while this forked shape measures 9–10k RPS).
 *
 * MODE env:
 *   seed    — login, seed PROBE_SEED docs, write the id pool to
 *             tmp/cluster-probe-ids.json, print `SEEDED <n> <ms>`.
 *   measure — read the id pool, login, run PROBE_OPS (warmup + measure),
 *             print `OP <op> <rps>` + `OPLAT <op> <p50> <p95> <p99>` per line.
 *
 * Node ≥ 24 (native type stripping). Erasable TS only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:4317";
const MODE = process.env.PROBE_MODE || "measure";
const OPS = (process.env.PROBE_OPS || "findByIdRandom,listPlain,create").split(",");
const CLIENTS = Number(process.env.PROBE_CLIENTS || 16);
const SECONDS = Number(process.env.PROBE_SECONDS || 10);
const WARMUP = Number(process.env.PROBE_WARMUP || 2);
const SEED = Number(process.env.PROBE_SEED || 20_000);
const ID_FILE = path.resolve(process.cwd(), "tmp", "cluster-probe-ids.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

async function login(): Promise<{ cookie: string; csrfToken: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `login failed: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  }
  const pairs = ((res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
  if (!pairs.some((c) => /auth_sessions/i.test(c))) throw new Error("login: no session cookie");
  const csrfPair = pairs.find((c) => /csrf/i.test(c));
  return {
    cookie: pairs.join("; "),
    csrfToken: csrfPair ? csrfPair.slice(csrfPair.indexOf("=") + 1) : "",
  };
}

function authHeaders(auth: { cookie: string; csrfToken: string }): Record<string, string> {
  return {
    Cookie: auth.cookie,
    Origin: BASE,
    ...(auth.csrfToken ? { "X-CSRF-Token": auth.csrfToken } : {}),
  };
}

async function seed(
  auth: { cookie: string; csrfToken: string },
  count: number,
): Promise<{ ids: string[]; ms: number }> {
  const url = `${BASE}/api/collections/BenchmarkStable`;
  const headers = { ...authHeaders(auth), "Content-Type": "application/json" };
  const ids: string[] = [];
  const t0 = performance.now();
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= count) return;
      const body = JSON.stringify({
        title: `cluster seed ${i}`,
        slug: `cluster-seed-${Date.now()}-${i}`,
        status: i % 3 === 0 ? "draft" : "published",
        count: i,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "cluster probe seed",
      });
      let ok = false;
      let lastErr = "";
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        try {
          const res = await fetch(url, { method: "POST", headers, body });
          if (!res.ok) {
            lastErr = `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`;
            throw new Error(lastErr);
          }
          const json = await res.json();
          const id = (json?.data?._id as string) || "";
          if (id) ids.push(id);
          ok = true;
        } catch (err) {
          lastErr = String(err);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
      if (!ok) throw new Error(`seed lost row ${i}: ${lastErr}`);
    }
  });
  await Promise.all(workers);
  if (ids.length !== count) throw new Error(`seed short: ${ids.length}/${count}`);
  return { ids, ms: performance.now() - t0 };
}

function loadIds(): string[] {
  const raw = readFileSync(ID_FILE, "utf8");
  const ids = JSON.parse(raw) as string[];
  if (!Array.isArray(ids) || ids.length < 100) throw new Error(`id pool too small: ${ids.length}`);
  return ids;
}

function p50(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Linear-interpolated percentile (same convention as benchmark-utils). */
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] * (1 - (idx - lo)) + s[hi] * (idx - lo);
}

async function runOp(
  auth: { cookie: string; csrfToken: string },
  op: string,
  ids: string[],
  seconds: number,
): Promise<{ rps: number; p50: number; p95: number; p99: number }> {
  const headers = authHeaders(auth);
  const target = (i: number) => {
    if (op === "create") {
      return {
        url: `${BASE}/api/collections/BenchmarkStable`,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `cluster op ${Date.now()}-${i}`,
            slug: `cluster-op-${Date.now()}-${i}`,
            status: "draft",
            count: i,
            publishDate: "2026-01-01T00:00:00.000Z",
            content: "cluster probe op",
          }),
        },
      };
    }
    if (op === "listPlain") {
      return { url: `${BASE}/api/collections/BenchmarkStable?limit=10`, init: { headers } };
    }
    return {
      url: `${BASE}/api/collections/BenchmarkStable/${ids[(Math.random() * ids.length) | 0]}`,
      init: { headers },
    };
  };
  const ok = { n: 0 };
  const err = { n: 0 };
  const statuses = new Map<number, number>();
  const latencies: number[] = [];
  const stop = { flag: false };
  const clients = Array.from({ length: CLIENTS }, async () => {
    for (;;) {
      if (stop.flag) return;
      const { url, init } = target(ok.n);
      const t0 = performance.now();
      try {
        const res = await fetch(url, init);
        await res.arrayBuffer();
        latencies.push(performance.now() - t0);
        if (res.ok) ok.n++;
        else {
          err.n++;
          statuses.set(res.status, (statuses.get(res.status) || 0) + 1);
        }
      } catch {
        err.n++;
      }
    }
  });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  stop.flag = true;
  await Promise.all(clients);
  if (err.n > ok.n * 0.02) {
    const detail = [...statuses.entries()].map(([s, c]) => `${s}×${c}`).join(" ") || "conn-errors";
    throw new Error(`${op}: ${err.n} errors vs ${ok.n} ok (${detail})`);
  }
  console.error(
    `  [client] ${op.padEnd(16)} p50 ${p50(latencies).toFixed(1)}ms p95 ${pct(latencies, 95).toFixed(1)}ms p99 ${pct(latencies, 99).toFixed(1)}ms | ${ok.n} ok / ${err.n} err`,
  );
  return {
    rps: ok.n / seconds,
    p50: p50(latencies),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
  };
}

async function main(): Promise<void> {
  const auth = await login();
  if (MODE === "seed") {
    const { ids, ms } = await seed(auth, SEED);
    mkdirSync(path.dirname(ID_FILE), { recursive: true });
    writeFileSync(ID_FILE, JSON.stringify(ids));
    console.log(`SEEDED ${ids.length} ${Math.round(ms)}`);
    return;
  }
  if (!existsSync(ID_FILE)) {
    throw new Error(`id pool missing — run MODE=seed first (${ID_FILE})`);
  }
  const ids = loadIds();
  for (const op of OPS) {
    await runOp(auth, op, ids, WARMUP);
    const measured = await runOp(auth, op, ids, SECONDS);
    console.log(`OP ${op} ${Math.round(measured.rps)}`);
    console.log(
      `OPLAT ${op} ${measured.p50.toFixed(1)} ${measured.p95.toFixed(1)} ${measured.p99.toFixed(1)}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[cluster-client] FAILED:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
