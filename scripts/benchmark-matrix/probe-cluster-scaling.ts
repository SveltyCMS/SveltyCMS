/**
 * @file scripts/benchmark-matrix/probe-cluster-scaling.ts
 * @description Multi-core cluster scaling curve for the collection lanes.
 * @summary Boots the built server (`index.server.mjs`) K times via node:cluster
 * (one shared listening socket, round-robin) and measures RPS per worker
 * count for the point-read, list and create lanes — the empirical curve
 * behind the cluster design in docs/reference/architecture/cluster-multi-core.mdx.
 *
 * ### Features:
 * - Sweeps K workers from CLUSTER_SWEEP (default "1,2,4,8")
 * - The load runs in a FORKED child (`probe-cluster-client.ts`) — never in
 *   the primary's event loop (an in-primary undici loop measured ~12 req/10s
 *   on Windows, a libuv/cluster interaction; the forked shape measures
 *   9–10k RPS against the same server)
 * - Seeds once on the first sweep step (CLUSTER_SEED, default 20_000 docs);
 *   the id pool persists in tmp/cluster-probe-ids.json
 * - Production mode (real sessions, WAF, rate limit, fast lanes)
 * - Prints RPS(K) + per-worker efficiency so the DB-ceiling crossover is visible
 *
 * ### Run (requires `bun run build` first):
 *   DB_TYPE=postgresql DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=bench \
 *   DB_PASSWORD=bench DB_NAME=sveltycms_bench PORT=4317 \
 *   RATE_LIMIT_MAX_REQUESTS=1000000 SECURITY_RATE_LIMIT_SCALE=100 \
 *   ADMIN_PASSWORD=Admin123! NODE_ENV=production BENCHMARK=true \
 *   node scripts/benchmark-matrix/probe-cluster-scaling.ts
 *
 * Node ≥ 24 (native type stripping). Erasable TS only.
 */

import cluster from "node:cluster";
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 4317);
const BASE = `http://127.0.0.1:${PORT}`;
const SWEEP = (process.env.CLUSTER_SWEEP || "1,2,4,8")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const OPS = (process.env.CLUSTER_OPS || "findByIdRandom,listPlain,create").split(",");
const CLIENT_FILE = path.resolve(process.cwd(), "scripts/benchmark-matrix/probe-cluster-client.ts");

/** Tracks unexpected worker deaths across all sweep steps. */
let workerError: Error | null = null;
const expectedExits: Set<number> = new Set();
cluster.on("exit", (worker) => {
  const pid = worker.process.pid ?? -1;
  if (
    !expectedExits.has(pid) &&
    worker.process.exitCode !== 0 &&
    worker.process.exitCode !== null
  ) {
    workerError = new Error(
      `worker ${pid} exited unexpectedly with code ${worker.process.exitCode}`,
    );
  }
  expectedExits.delete(pid);
});

// ── Worker branch: boot the built server on the shared cluster socket ──────
if (!cluster.isPrimary) {
  const entry = path.resolve(process.cwd(), "index.server.mjs");
  if (!existsSync(entry)) {
    console.error("[cluster-probe] index.server.mjs missing — run `bun run build` first");
    process.exit(1);
  }
  import(pathToFileURL(entry).href)
    .then((m) => (typeof m.startServer === "function" ? m.startServer() : m.default()))
    .catch((err) => {
      console.error("[cluster-probe] worker boot failed:", err);
      process.exit(1);
    });
} else {
  main()
    .catch((err) => {
      console.error("[cluster-probe] FAILED:", err);
      cleanup(1);
    })
    .then(() => cleanup(0));
}

function cleanup(code: number): void {
  for (const w of Object.values(cluster.workers || {})) w?.kill();
  setTimeout(() => process.exit(code), 500);
}

// ── Primary branch: sweep worker counts and measure ────────────────────────

interface StepResult {
  workers: number;
  rps: Record<string, number>;
}

async function waitReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      // Any HTTP answer means the pipeline is up (auth-protected routes 401).
      const res = await fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(2_000) });
      if (res.status < 500) return;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not ready within ${timeoutMs}ms (${lastErr})`);
}

async function startWorkers(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const w = cluster.fork({ CLUSTER_WORKER: String(i) });
    expectedExits.add(w.process.pid ?? -1);
  }
  await waitReady(90_000);
  if (workerError) throw workerError;
}

async function stopWorkers(): Promise<void> {
  const exited: Promise<number>[] = [];
  for (const w of Object.values(cluster.workers || {})) {
    if (!w) continue;
    w.kill();
    exited.push(
      new Promise<number>((resolve) => {
        w.once("exit", (code) => resolve(code));
      }),
    );
  }
  await Promise.all(exited);
  if (workerError) throw workerError;
}

/** Fork the load-generator child; resolve with its parsed stdout lines. */
function runClient(env: Record<string, string>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = fork(CLIENT_FILE, [], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "inherit", "ipc"],
    });
    const lines: string[] = [];
    let buf = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) {
          lines.push(line);
          console.log(`  ${line}`);
        }
      }
    });
    child.once("exit", (code) => {
      if (code === 0) resolve(lines);
      else reject(new Error(`client child exited with ${code}`));
    });
    child.once("error", reject);
  });
}

async function main(): Promise<void> {
  const entry = path.resolve(process.cwd(), "index.server.mjs");
  if (!existsSync(entry)) {
    throw new Error("index.server.mjs missing — run `bun run build` first");
  }
  console.log(
    `\n=== CLUSTER SCALING PROBE (${process.env.DB_TYPE || "postgresql"} @ ${process.env.DB_HOST}:${process.env.DB_PORT}, port ${PORT}, ${process.env.CLUSTER_CLIENTS || 16} clients, ${process.env.CLUSTER_SECONDS || 10}s/op) ===`,
  );

  const results: StepResult[] = [];
  const clientEnv = {
    PROBE_BASE: BASE,
    PROBE_OPS: OPS.join(","),
    PROBE_CLIENTS: process.env.CLUSTER_CLIENTS || "16",
    PROBE_SECONDS: process.env.CLUSTER_SECONDS || "10",
    PROBE_WARMUP: process.env.CLUSTER_WARMUP || "2",
    PROBE_SEED: String(Number(process.env.CLUSTER_SEED ?? 0) || 20_000),
  };

  for (let i = 0; i < SWEEP.length; i++) {
    const k = SWEEP[i];
    console.log(`\n--- K=${k} workers ---`);
    await startWorkers(k);
    const idFile = path.resolve(process.cwd(), "tmp", "cluster-probe-ids.json");
    if (i === 0 && (Number(process.env.CLUSTER_SEED ?? 0) > 0 || !existsSync(idFile))) {
      console.log("  [seed phase]");
      await runClient({ ...clientEnv, PROBE_MODE: "seed" });
    }
    const lines = await runClient({ ...clientEnv, PROBE_MODE: "measure" });
    const rps: Record<string, number> = {};
    for (const line of lines) {
      const m = /^OP (\S+) (\d+)$/.exec(line);
      if (m) rps[m[1]] = Number(m[2]);
    }
    results.push({ workers: k, rps });
    await stopWorkers();
  }

  // ── Summary table: RPS per op per worker count + per-worker efficiency ──
  console.log(`\n${"op".padEnd(16)} ${SWEEP.map((k) => `K=${k}`.padStart(9)).join("")}`);
  for (const op of OPS) {
    const row = SWEEP.map((k) =>
      String((results.find((r) => r.workers === k)?.rps[op] ?? 0).toLocaleString()).padStart(9),
    ).join("");
    console.log(`${op.padEnd(16)} ${row}`);
  }
  const k1 = SWEEP[0];
  for (const op of OPS) {
    const base = results.find((r) => r.workers === k1)?.rps[op] ?? 0;
    const eff = SWEEP.map((k) => {
      const r = results.find((x) => x.workers === k)?.rps[op] ?? 0;
      return `${(base ? (r / base / k).toFixed(2) : "—").padStart(9)}`;
    }).join("");
    console.log(`${`${op}/worker-eff`.padEnd(16)} ${eff}  (rps ÷ K ÷ rps(K=1))`);
  }
}
