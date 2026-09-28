/**
 * @file tests/benchmarks/probe-list-compression-ab.test.ts
 * @description Compression-separated A/B for the collection list MISS path.
 * @summary `Accept-Encoding: zstd` vs `identity` at c=1/2/4/8 on a ~310 KB
 * list, using the `x-srv-split` marks so the compression wait is isolated
 * from the row-build cost; plus an in-process profile of the work inside the
 * build segment (etag hash / byteLength / Buffer copy).
 *
 * ### Features:
 * - Standalone or shared-server mode (`API_BASE_URL` set by the matrix runner)
 * - `SVELTY_SRV_SPLIT=1` / `SVELTY_SRV_DUR=1` on the server → `x-srv-split` deltas
 * - HTTP seed into `BenchmarkStable` (200+ rows x ~1.5 KB) with full cleanup —
 *   works in shared-server mode where in-process seeding cannot reach the server DB
 * - Unique `probe=` cache key per request — every measured request is a true MISS,
 *   so single-flight coalescing cannot fold N requests into one build
 * - Per-arm `x-srv-split` deltas: db−lookup, build−db (trim+stringify+etag),
 *   cachewrite−build (byteLength+negotiate+compress+cache set), serve−cachewrite
 * - In-process: `generateContentEtag` / `Buffer.byteLength` / `Buffer.from` on the
 *   captured body + a reciprocal-multiply hash candidate (output-equality checked)
 *
 * Diagnostic probe — excluded from the matrix (`SKIP_IN_MATRIX`).
 *
 * Requirements:
 * - A fully initialised sandbox DB (`config/test-database/<DB_NAME>.sqlite`) with
 *   `auth_users` + `system_preferences`. The pre-boot seeder creates a fresh file
 *   with the content/collection schema ONLY — admin seeding then silently no-ops
 *   and login 401s. Restore a completed DB with
 *   `VACUUM INTO 'config/test-database/<DB_NAME>.sqlite'` from a seeded database.
 * - `SVELTY_SRV_SPLIT=1 SVELTY_SRV_DUR=1` in the environment (propagated to the
 *   spawned server) for the `x-srv-split` deltas.
 *
 * Run:
 *   DB_NAME=benchmark_shared SVELTY_SRV_SPLIT=1 SVELTY_SRV_DUR=1 bun test tests/benchmarks/probe-list-compression-ab.test.ts --timeout 600000
 */

import {
  test,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
  loginBenchmarkUser,
  STABLE_COLLECTION,
} from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const COLLECTION = STABLE_COLLECTION;
/** Seeded rows (blind to pre-existing rows; the newest 199 dominate the page). */
const SEED_ROWS = Number(process.env.PROBE_SEED || 220);
/** < MAX_PAGE_SIZE (200): the lane declines at/above the cap. */
const LIST_LIMIT = 199;
const ROW_CONTENT_CHARS = Number(process.env.PROBE_ROW_CHARS || 1500);
const N = Number(process.env.PROBE_N || 40);
const WARMUP = 5;
const CONCURRENCIES = (process.env.PROBE_C || "1,2,4,8")
  .split(",")
  .map((v) => Number(v))
  .filter((v) => Number.isFinite(v) && v > 0);
const ENCODINGS = ["identity", "zstd"] as const;
type Encoding = (typeof ENCODINGS)[number];

const PHASES = ["lookup", "db", "build", "cachewrite", "serve"] as const;
type Phase = (typeof PHASES)[number];

interface Row {
  status: number;
  cache: string;
  enc: string;
  cl: number;
  drained: number;
  ms: number;
  srv: number;
  split: Partial<Record<Phase, number>>;
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "n/a");

function parseSplit(res: Response): Partial<Record<Phase, number>> {
  const out: Partial<Record<Phase, number>> = {};
  for (const part of (res.headers.get("x-srv-split") || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const label = part.slice(0, eq) as Phase;
    const ms = Number(part.slice(eq + 1));
    if ((PHASES as readonly string[]).includes(label) && Number.isFinite(ms)) out[label] = ms;
  }
  return out;
}

async function runArm(opts: {
  baseUrl: string;
  headers: Record<string, string>;
  encoding: Encoding;
  concurrency: number;
  n: number;
  seq: { next: number };
}): Promise<{ rows: Row[]; wallMs: number }> {
  const { baseUrl, headers, encoding, concurrency, n, seq } = opts;
  const rows: Row[] = [];
  let cursor = 0;
  const started = performance.now();
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= n) return;
      const url = `${baseUrl}/api/collections/${COLLECTION}?limit=${LIST_LIMIT}&probe=${seq.next++}`;
      const t0 = performance.now();
      const res = await fetch(url, { headers: { ...headers, "accept-encoding": encoding } });
      const buf = await res.arrayBuffer();
      const ms = performance.now() - t0;
      rows.push({
        status: res.status,
        cache: res.headers.get("x-cache") || "-",
        enc: res.headers.get("content-encoding") || "-",
        cl: Number(res.headers.get("content-length") || "0"),
        drained: buf.byteLength,
        ms,
        srv: Number(res.headers.get("x-srv-dur") || "NaN"),
        split: parseSplit(res),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, worker));
  return { rows, wallMs: performance.now() - started };
}

/** Paired per-request delta p50 between two cumulative marks. */
function deltaP50(rows: Row[], a: Phase, b: Phase): number {
  const vals = rows
    .map((r) => (r.split[a] ?? NaN) - (r.split[b] ?? NaN))
    .filter((v) => Number.isFinite(v));
  return pct(vals, 50);
}

function summarizeArm(label: string, rows: Row[], wallMs: number): void {
  const lat = rows.map((r) => r.ms);
  const rps = (rows.length / Math.max(wallMs, 1)) * 1000;
  const cacheDist = rows.reduce<Record<string, number>>((m, r) => {
    m[r.cache] = (m[r.cache] || 0) + 1;
    return m;
  }, {});
  const identityBody = rows.find((r) => r.enc === "-");
  console.log(
    `${label.padEnd(14)} n=${String(rows.length).padEnd(3)} p50=${f3(pct(lat, 50))}ms p95=${f3(pct(lat, 95))}ms rps=${rps.toFixed(0).padEnd(4)}` +
      ` | srv ${f3(
        pct(
          rows.map((r) => r.srv),
          50,
        ),
      )} | dbΔ ${f3(deltaP50(rows, "db", "lookup"))} buildΔ ${f3(deltaP50(rows, "build", "db"))}` +
      ` cacheΔ ${f3(deltaP50(rows, "cachewrite", "build"))} serveΔ ${f3(deltaP50(rows, "serve", "cachewrite"))}` +
      ` | enc=${rows[0]?.enc ?? "-"} cl=${rows[0]?.cl ?? 0} body=${identityBody?.drained ?? rows[0]?.drained ?? 0} ${JSON.stringify(cacheDist)}`,
  );
}

// ─── In-process hash candidate (measurement only — not used by src) ──────────
/**
 * Same FNV-1a 64-bit fold as `fnv1a64Hex`, but the 2^32 carry is extracted with
 * an exact reciprocal multiply (`x * 2^-32`) instead of a float division.
 * Identical output; the question is only whether it is measurably faster.
 */
function fnv1a64HexCandidate(input: string): string {
  const FNV_PRIME_LO = 0x1b3;
  const FNV_PRIME_HI = 0x100;
  const INV_TWO_32 = 1 / 0x100000000;
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  const len = input.length;
  for (let i = 0; i < len; i++) {
    const code = input.charCodeAt(i);
    lo = (lo ^ (code & 0xff)) >>> 0;
    const m1 = lo * FNV_PRIME_LO;
    const lo1 = m1 >>> 0;
    const carry1 = (m1 - lo1) * INV_TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry1) >>> 0;
    lo = lo1;
    lo = (lo ^ (code >>> 8)) >>> 0;
    const m2 = lo * FNV_PRIME_LO;
    const lo2 = m2 >>> 0;
    const carry2 = (m2 - lo2) * INV_TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry2) >>> 0;
    lo = lo2;
  }
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

async function profileInProcess(body: string, serverBuildDeltaMs: number): Promise<void> {
  const { generateContentEtag } = await import("@src/services/cache/response-cache");
  const opts = Number(process.env.PROBE_PROFILE_N || 30);
  const bench = (fn: () => void): number => {
    for (let i = 0; i < 5; i++) fn(); // warm
    const t0 = performance.now();
    for (let i = 0; i < opts; i++) fn();
    return (performance.now() - t0) / opts;
  };

  const etagMs = bench(() => {
    generateContentEtag(body);
  });
  const candidateMs = bench(() => {
    fnv1a64HexCandidate(body);
  });
  const byteLenMs = bench(() => {
    Buffer.byteLength(body, "utf8");
  });
  const bufferFromMs = bench(() => {
    Buffer.from(body);
  });

  // The FNV fold still backs bodies below the native-digest threshold — equality
  // is checked there. The large body must be deterministic and content-sensitive.
  const small = body.slice(0, 512);
  let identical = generateContentEtag(small) === `"${fnv1a64HexCandidate(small)}"`;
  for (let i = 0; i < 2000 && identical; i++) {
    let s = "";
    const len = 1 + (i % 64);
    for (let j = 0; j < len; j++) s += String.fromCharCode(Math.floor(Math.random() * 0x10000));
    identical = generateContentEtag(s) === `"${fnv1a64HexCandidate(s)}"`;
  }
  const e1 = generateContentEtag(body);
  const e2 = generateContentEtag(body);
  const e3 = generateContentEtag(`${body}x`);

  console.log(`\n=== IN-PROCESS BUILD-SEGMENT PROFILE (n=${opts}) ===`);
  console.log(
    `body: ${body.length} chars / ${Buffer.byteLength(body, "utf8")} utf8 bytes | server buildΔ (c=1 identity) ${f3(serverBuildDeltaMs)} ms`,
  );
  console.log(`  generateContentEtag (current)  ${f3(etagMs)} ms/op`);
  console.log(
    `  fnv fold (previous path)      ${f3(candidateMs)} ms/op — <1 KiB equality: ${identical ? "yes" : "NO"}`,
  );
  console.log(`  Buffer.byteLength(utf8)        ${f3(byteLenMs)} ms/op`);
  console.log(`  Buffer.from(body)              ${f3(bufferFromMs)} ms/op`);
  console.log(
    `  large-body etag ${e1.slice(0, 22)}… deterministic=${e1 === e2} sensitive=${e1 !== e3}`,
  );
}

/** Best-effort cleanup of the rows this probe created. */
async function deleteRows(baseUrl: string, headers: Record<string, string>, ids: string[]) {
  let deleted = 0;
  for (const id of ids) {
    const res = await fetch(`${baseUrl}/api/collections/${COLLECTION}/${id}`, {
      method: "DELETE",
      headers,
    }).catch(() => null);
    if (res?.ok) deleted++;
  }
  return deleted;
}

test("list compression A/B (x-srv-split) + build-segment profile", async () => {
  // Shared-server mode (matrix): the server env is owned by the runner and must
  // carry SVELTY_SRV_SPLIT=1. Standalone mode: propagate it to the spawned server.
  process.env.SVELTY_SRV_SPLIT = "1";
  process.env.SVELTY_SRV_DUR = "1";

  let stop: (() => Promise<void>) | null = null;
  const seededIds: string[] = [];
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;

    // Shared-mode logins are deferred (and silently swallowed) by the harness —
    // this probe needs auth, so surface the real error instead of a bare guard.
    try {
      benchmarkAuthHeaders();
    } catch {
      await loginBenchmarkUser(baseUrl);
    }
    const headers: Record<string, string> = { ...benchmarkAuthHeaders() };
    /** Mutations must declare JSON — Bun sends `text/plain` for string bodies otherwise. */
    const seedHeaders: Record<string, string> = {
      ...headers,
      "content-type": "application/json",
    };

    // ── Seed the ~310 KB list shape through the API (works in shared mode) ──
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
    const padding = lorem
      .repeat(Math.ceil(ROW_CONTENT_CHARS / lorem.length))
      .slice(0, ROW_CONTENT_CHARS);
    const runId = Date.now().toString(36);
    const collectionUrl = `${baseUrl}/api/collections/${COLLECTION}`;
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers: seedHeaders,
      count: SEED_ROWS,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `comp-ab ${runId} ${i}`,
        slug: `comp-ab-${runId}-${i}`,
        status: "published",
        count: i,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: `${padding} #${runId}-${i}`,
      }),
      existing: seededIds,
    });

    const seq = { next: 1 };
    console.log(
      `\n=== LIST COMPRESSION A/B (${COLLECTION}: +${seededIds.length} rows x ~${ROW_CONTENT_CHARS} chars, limit=${LIST_LIMIT}, N=${N}) ===`,
    );

    const summary: Array<{
      encoding: Encoding;
      c: number;
      p50: number;
      rps: number;
      build: number;
      cache: number;
    }> = [];
    let identityBody = "";
    let identityBuildDelta = NaN;

    for (const c of CONCURRENCIES) {
      for (const encoding of ENCODINGS) {
        // Warmup (unique keys — never measured).
        await runArm({ baseUrl, headers, encoding, concurrency: c, n: WARMUP, seq });
        const { rows, wallMs } = await runArm({
          baseUrl,
          headers,
          encoding,
          concurrency: c,
          n: N,
          seq,
        });
        summarizeArm(`c=${c} ${encoding}`, rows, wallMs);
        const build = deltaP50(rows, "build", "db");
        const cache = deltaP50(rows, "cachewrite", "build");
        summary.push({
          encoding,
          c,
          p50: pct(
            rows.map((r) => r.ms),
            50,
          ),
          rps: (N / wallMs) * 1000,
          build,
          cache,
        });

        // Capture one identity body in-process for the profile — the same shape
        // the server built (unique key, MISS, uncompressed).
        if (encoding === "identity" && c === 1 && !identityBody) {
          const res = await fetch(
            `${baseUrl}/api/collections/${COLLECTION}?limit=${LIST_LIMIT}&probe=${seq.next++}`,
            { headers: { ...headers, "accept-encoding": "identity" } },
          );
          identityBody = await res.text();
          identityBuildDelta = deltaP50(rows, "build", "db");
        }
      }
    }

    console.log("\n=== A/B SUMMARY (p50, ms) ===");
    console.log("enc        c   p50    rps   buildΔ  cacheΔ(compress+cacheset)");
    for (const s of summary) {
      console.log(
        `${s.encoding.padEnd(10)} ${String(s.c).padEnd(3)} ${f3(s.p50).padEnd(6)} ${s.rps.toFixed(0).padEnd(5)} ${f3(s.build).padEnd(7)} ${f3(s.cache)}`,
      );
    }

    if (identityBody) await profileInProcess(identityBody, identityBuildDelta);
    else console.log("\n[profile] no identity body captured — skipped");
  } finally {
    if (seededIds.length > 0) {
      const headers = (() => {
        try {
          return benchmarkAuthHeaders();
        } catch {
          return null;
        }
      })();
      if (headers) {
        const deleted = await deleteRows(process.env.API_BASE_URL || "", headers, seededIds);
        console.log(`\n[cleanup] deleted ${deleted}/${seededIds.length} seeded rows`);
      }
    }
    if (stop) await stop();
  }
}, 600_000);
