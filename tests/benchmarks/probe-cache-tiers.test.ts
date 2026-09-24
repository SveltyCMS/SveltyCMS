/**
 * @file tests/benchmarks/probe-cache-tiers.test.ts
 * @description Per-tier cache accounting probe (Gap 4) — quantifies each cache
 * tier with targeted HTTP load against a standalone benchmark server instead of
 * guessing from code inspection.
 *
 * ### Features:
 * - Standalone production-mode server (`setupBenchmarkServer`) + real admin session
 * - Baseline snapshot, one load phase per tier, re-snapshot after each phase
 * - Point-read FIFO: 3 sequential passes over N_POINT distinct entry ids — the
 *   2-touch admission (MISS → MISS → TURBO-HIT) and the 2000-slot FIFO boundary
 * - List tier: N_LIST unique `?limit=10&x={i}` URLs (first-touch admission,
 *   TURBO-HIT on repeat) + byte estimate from wire bodies
 * - L1 content cache (`cacheService`): N_L1 identical `?refresh=true` list GETs —
 *   the lane bypasses only the response cache, the read pipeline still serves
 *   `cacheService` hits (X-Cache: BYPASS + hit/miss deltas in cache-metrics)
 * - GraphQL response/schema cache: N_GQL identical POSTs → graphql counters
 * - Server RSS sampled from `GET /api/system/health?verbose=true` (`memory.rss`)
 * - Per-tier table: entries, size (if available), hit/miss deltas, RSS delta
 *
 * ### Probe contract (what exists — NO new endpoints were added):
 * - `GET /api/dashboard/cache-metrics` (admin session): overall hits / misses /
 *   hitRate / sets / deletes / size of `cacheService`. `size` is the L1 LRU entry
 *   count. `byCategory` / `byTenant` / `recentMisses` are structurally empty —
 *   `CacheService.getStats()` only returns hits / misses / evictions / l1Hits /
 *   l2Hits / l1Size / size / deletes (l1Hits / l2Hits / evictions are not
 *   surfaced by the endpoint).
 * - `GET /api/system/health?verbose=true`: process-level memory
 *   (rss / heapTotal / heapUsed / external / arrayBuffers) + the graphql counter
 *   block (schemaHits / schemaMisses / responseHits / responseMisses + rates).
 * - `GET /api/dashboard/metrics?detailed=true`: api cacheHits / l1Hits / l2Hits /
 *   cacheMisses + the graphql block + `system.memory` — OS-level memory only,
 *   NOT process RSS (payload itself cached 5 s).
 * - Response-cache tier sizes (`responseCache.getL1ByteStats()`: listEntries /
 *   pointEntries / listBytes / pointBytes / budgets) and `cacheService.getStats()`
 *   l1Hits / l2Hits / evictions exist only in-process; there is no HTTP surface.
 *   Those tiers are measured behaviorally (X-Cache attribution + verified-hit
 *   counts) and reported as a body-bytes estimate from the wire.
 * - RSS verdict: REACHABLE via `/api/system/health?verbose=true` (process RSS).
 * - Per-request tier attribution: `X-Cache` response header
 *   (TURBO-HIT / MISS / BYPASS) and `x-graphql-cache` for GraphQL.
 */
import {
  test,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
  stabilize,
} from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const SEED = Number(process.env.PROBE_SEED) || 2200;
const N_POINT = Number(process.env.PROBE_POINT) || 2100; // > 2000 point-FIFO slots
const N_LIST = Number(process.env.PROBE_LIST) || 1500;
const N_L1 = Number(process.env.PROBE_L1) || 400;
const N_GQL = Number(process.env.PROBE_GQL) || 200;

// ── Wire payload shapes (the HTTP surface this probe is allowed to use) ──────

interface CacheMetricsPayload {
  overall: {
    hits: number;
    misses: number;
    hitRate: number;
    sets: number;
    deletes: number;
    size: number;
    totalOperations: number;
  };
  byCategory?: Record<string, unknown>;
  byTenant?: Record<string, unknown>;
  timestamp: number;
}

interface MemoryFields {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface GraphqlCounters {
  schemaHits: number;
  schemaMisses: number;
  schemaRebuildMs: number;
  responseHits: number;
  responseMisses: number;
  schemaHitRate: number;
  responseHitRate: number;
}

interface HealthPayload {
  status: string;
  overallStatus: string;
  timestamp: number;
  uptime: number;
  memory?: MemoryFields;
  graphql?: GraphqlCounters;
}

interface ApiCounters {
  requests: number;
  errors: number;
  cacheHits: number;
  l1Hits: number;
  l2Hits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

interface DetailedPayload {
  api?: ApiCounters;
  graphql?: GraphqlCounters;
  system?: { memory?: { used: number; total: number } };
}

interface ServerSnapshot {
  cm: CacheMetricsPayload | null;
  health: HealthPayload | null;
  detailed: DetailedPayload | null;
}

interface ReadRow {
  status: number;
  cache: string;
  ms: number;
  bytes: number;
}

interface PhaseResult {
  label: string;
  reqs: number;
  wallMs: number;
  cacheDist: Record<string, number>;
  bodyBytes: number;
  /** Distinct cacheable keys exercised (for per-entry byte estimates). */
  distinctKeys: number;
  /** Verification reads served from cache (behavioral tier-occupancy evidence). */
  verifiedHits: number;
  /** Per-phase detail lines (e.g. FIFO boundary evidence). */
  notes: string[];
}

interface TierRow {
  tier: string;
  drivenBy: string;
  entries: string;
  size: string;
  hits: string;
  misses: string;
  rssMb: string;
  heapMb: string;
}

const MB = 1024 * 1024;
const num = (v: number | undefined | null): number => (typeof v === "number" ? v : 0);

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function cacheLabel(res: Response): string {
  return (
    res.headers.get("x-cache") ||
    res.headers.get("x-graphql-cache") ||
    res.headers.get("x-svelty-cache") ||
    "-"
  ).toUpperCase();
}

const isHit = (label: string): boolean => label.includes("HIT") || label.includes("TURBO");

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

async function readOne(url: string, headers: Record<string, string>): Promise<ReadRow> {
  const t0 = performance.now();
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  const ms = performance.now() - t0;
  const body = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  return { status: res.status, cache: cacheLabel(res), ms, bytes: body.byteLength };
}

async function snapshotServer(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<ServerSnapshot> {
  const [cm, health, detailed] = await Promise.all([
    fetchJson<CacheMetricsPayload>(`${baseUrl}/api/dashboard/cache-metrics`, { headers }),
    fetchJson<HealthPayload>(`${baseUrl}/api/system/health?verbose=true`),
    fetchJson<DetailedPayload>(`${baseUrl}/api/dashboard/metrics?detailed=true`, { headers }),
  ]);
  return { cm, health, detailed };
}

// ── Load phases (one per tier) ───────────────────────────────────────────────

async function phasePoint(
  collectionUrl: string,
  headers: Record<string, string>,
  ids: string[],
  n: number,
): Promise<PhaseResult> {
  const t0 = Date.now();
  const pass1: ReadRow[] = [];
  const pass2: ReadRow[] = [];
  const pass3: ReadRow[] = [];
  let bodyBytes = 0;

  // Pass 1: first sighting — the 2-touch admission filter records the id, no slot.
  for (let i = 0; i < n; i++) {
    const r = await readOne(`${collectionUrl}/${ids[i]}`, headers);
    pass1.push(r);
    bodyBytes += r.bytes;
  }
  // Pass 2: second sighting — the id is admitted into the 2000-slot FIFO.
  for (let i = 0; i < n; i++) {
    const r = await readOne(`${collectionUrl}/${ids[i]}`, headers);
    pass2.push(r);
    bodyBytes += r.bytes;
  }
  // Pass 3 (verification, reverse order): newest-admitted ids verify first, the
  // FIFO-evicted oldest ids are read last so their re-admission cannot evict
  // anything that still has to be verified.
  for (let i = n - 1; i >= 0; i--) {
    const r = await readOne(`${collectionUrl}/${ids[i]}`, headers);
    pass3.push(r);
    bodyBytes += r.bytes;
  }

  const dist = (rows: ReadRow[]): Record<string, number> =>
    rows.reduce<Record<string, number>>((m, r) => {
      m[r.cache] = (m[r.cache] ?? 0) + 1;
      return m;
    }, {});

  const verifiedHits = pass3.filter((r) => isHit(r.cache)).length;
  const notes = [
    `pass1 ${JSON.stringify(dist(pass1))}`,
    `pass2 ${JSON.stringify(dist(pass2))}`,
    `pass3 ${JSON.stringify(dist(pass3))} — ${verifiedHits}/${n} ids verified resident (2-touch admission; FIFO cap 2000)`,
  ];
  return {
    label: "point-read FIFO",
    reqs: n * 3,
    wallMs: Date.now() - t0,
    cacheDist: dist([...pass1, ...pass2, ...pass3]),
    bodyBytes,
    distinctKeys: n,
    verifiedHits,
    notes,
  };
}

async function phaseList(
  collectionUrl: string,
  headers: Record<string, string>,
  n: number,
): Promise<PhaseResult> {
  const t0 = Date.now();
  const pass1: ReadRow[] = [];
  const pass2: ReadRow[] = [];
  let bodyBytes = 0;
  for (let i = 0; i < n; i++) {
    const r = await readOne(`${collectionUrl}?limit=10&x=${i}`, headers);
    pass1.push(r);
    bodyBytes += r.bytes;
  }
  for (let i = 0; i < n; i++) {
    const r = await readOne(`${collectionUrl}?limit=10&x=${i}`, headers);
    pass2.push(r);
    bodyBytes += r.bytes;
  }
  const dist = (rows: ReadRow[]): Record<string, number> =>
    rows.reduce<Record<string, number>>((m, r) => {
      m[r.cache] = (m[r.cache] ?? 0) + 1;
      return m;
    }, {});
  const pass2Hits = pass2.filter((r) => isHit(r.cache)).length;
  const notes = [
    `pass1 ${JSON.stringify(dist(pass1))}`,
    `pass2 ${JSON.stringify(dist(pass2))} — ${pass2Hits}/${n} unique list URLs served TURBO-HIT`,
    `note: x={i} is not a parsed query param, so all ${n} URLs share ONE canonical cacheService find key (the list tier churns, the content cache serves the same entry)`,
  ];
  return {
    label: "list tier",
    reqs: n * 2,
    wallMs: Date.now() - t0,
    cacheDist: dist([...pass1, ...pass2]),
    bodyBytes,
    distinctKeys: n,
    verifiedHits: pass2Hits,
    notes,
  };
}

async function phaseL1(
  collectionUrl: string,
  headers: Record<string, string>,
  n: number,
): Promise<PhaseResult> {
  const t0 = Date.now();
  const rows: ReadRow[] = [];
  let bodyBytes = 0;
  // `refresh=true` bypasses only the responseCache READ (the lane label is
  // BYPASS); `parseCollectionQueryParams` maps only `bypassCache`/`nocache` to
  // `bypassCache`, so the read pipeline still consults cacheService — repeated
  // identical queries therefore exercise the L1 content cache.
  const url = `${collectionUrl}?limit=10&refresh=true&x=L1`;
  for (let i = 0; i < n; i++) {
    const r = await readOne(url, headers);
    rows.push(r);
    bodyBytes += r.bytes;
  }
  const dist = rows.reduce<Record<string, number>>((m, r) => {
    m[r.cache] = (m[r.cache] ?? 0) + 1;
    return m;
  }, {});
  const notes = [
    `labels ${JSON.stringify(dist)} — expected BYPASS ×${n} (lane bypass) while cacheService records the hits`,
  ];
  return {
    label: "L1 content cache",
    reqs: n,
    wallMs: Date.now() - t0,
    cacheDist: dist,
    bodyBytes,
    distinctKeys: 1,
    verifiedHits: 0,
    notes,
  };
}

async function phaseGraphql(
  baseUrl: string,
  headers: Record<string, string>,
  n: number,
): Promise<PhaseResult> {
  const t0 = Date.now();
  const rows: ReadRow[] = [];
  let bodyBytes = 0;
  const endpoint = `${baseUrl}/api/graphql`;
  const body = JSON.stringify({ query: "query { contentSystemHealth { state version } }" });
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    rows.push({
      status: res.status,
      cache: cacheLabel(res),
      ms: performance.now() - start,
      bytes: buf.byteLength,
    });
    bodyBytes += buf.byteLength;
  }
  const dist = rows.reduce<Record<string, number>>((m, r) => {
    m[r.cache] = (m[r.cache] ?? 0) + 1;
    return m;
  }, {});
  const hits = rows.filter((r) => isHit(r.cache)).length;
  const notes = [
    `labels ${JSON.stringify(dist)} — ${hits}/${n} served from the GraphQL response cache`,
  ];
  return {
    label: "graphql response/schema",
    reqs: n,
    wallMs: Date.now() - t0,
    cacheDist: dist,
    bodyBytes,
    distinctKeys: 1,
    verifiedHits: hits,
    notes,
  };
}

// ── Reporting ────────────────────────────────────────────────────────────────

function printContract(): void {
  console.log(`\n=== CACHE-TIER PROBE CONTRACT ===`);
  console.log(`  Endpoints used:`);
  console.log(
    `    GET /api/dashboard/cache-metrics         → cacheService overall hits/misses/size (L1 entries)`,
  );
  console.log(
    `    GET /api/system/health?verbose=true      → process RSS + graphql schema/response counters`,
  );
  console.log(
    `    GET /api/dashboard/metrics?detailed=true → api cache counters + OS-level memory (NOT process RSS)`,
  );
  console.log(
    `    GET /api/collections/{coll}[/{id}]       → per-request X-Cache tier attribution`,
  );
  console.log(`    POST /api/graphql                        → GraphQL response/schema cache`);
  console.log(`  In-process only (no HTTP surface — measured behaviorally instead):`);
  console.log(`    responseCache.getL1ByteStats()  listEntries/pointEntries/bytes/budgets`);
  console.log(`    cacheService.getStats()          l1Hits/l2Hits/evictions`);
  console.log(`  RSS: REACHABLE via /api/system/health?verbose=true (memory.rss).`);
  console.log(`  NOT exposed anywhere: per-tier byte counters of the response cache tiers.\n`);
}

function distLine(d: Record<string, number>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k}×${v}`)
    .join(" ");
}

function fmtMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

function printTierTable(rows: TierRow[]): void {
  const head = ["tier", "driven by", "entries", "size", "hits Δ", "misses Δ", "rss Δ", "heap Δ"];
  const widths = head.map((h, i) =>
    Math.max(
      h.length,
      ...rows.map(
        (r) =>
          [r.tier, r.drivenBy, r.entries, r.size, r.hits, r.misses, r.rssMb, r.heapMb][i]!.length,
      ),
    ),
  );
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ");
  console.log(`\n=== PER-TIER CACHE ACCOUNTING ===`);
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
  for (const r of rows) {
    console.log(line([r.tier, r.drivenBy, r.entries, r.size, r.hits, r.misses, r.rssMb, r.heapMb]));
  }
  console.log("");
}

function snapshotDelta(
  prev: ServerSnapshot,
  next: ServerSnapshot,
): {
  cmHits: number;
  cmMisses: number;
  cmSize: number;
  rssMb: number;
  heapMb: number;
  gqlResponseHits: number;
  gqlSchemaHits: number;
  gqlResponseMisses: number;
  gqlSchemaMisses: number;
} {
  return {
    cmHits: num(next.cm?.overall.hits) - num(prev.cm?.overall.hits),
    cmMisses: num(next.cm?.overall.misses) - num(prev.cm?.overall.misses),
    cmSize: num(next.cm?.overall.size) - num(prev.cm?.overall.size),
    rssMb: (num(next.health?.memory?.rss) - num(prev.health?.memory?.rss)) / MB,
    heapMb: (num(next.health?.memory?.heapUsed) - num(prev.health?.memory?.heapUsed)) / MB,
    gqlResponseHits:
      num(next.health?.graphql?.responseHits) - num(prev.health?.graphql?.responseHits),
    gqlSchemaHits: num(next.health?.graphql?.schemaHits) - num(prev.health?.graphql?.schemaHits),
    gqlResponseMisses:
      num(next.health?.graphql?.responseMisses) - num(prev.health?.graphql?.responseMisses),
    gqlSchemaMisses:
      num(next.health?.graphql?.schemaMisses) - num(prev.health?.graphql?.schemaMisses),
  };
}

// ── Probe ────────────────────────────────────────────────────────────────────

test("cache-tier accounting probe (point FIFO / list tier / L1 content / graphql / RSS)", async () => {
  let stop: (() => Promise<void>) | null = null;
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;
    if (!baseUrl) throw new Error("setupBenchmarkServer returned no baseUrl");
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;

    printContract();

    // ── Seed (bulk lane) ────────────────────────────────────────────────
    const createdIds: string[] = [];
    const seedT0 = Date.now();
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: SEED,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `Tier probe doc ${i}`,
        slug: `tier-probe-${i}`,
        status: i % 3 === 0 ? "draft" : "published",
        count: i * 10,
        publishDate: "2026-01-01T00:00:00.000Z",
        content:
          `# Tier probe ${i}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. `.repeat(
            12,
          ),
      }),
      existing: createdIds,
    });
    console.log(
      `[seed] ${createdIds.length} docs in ${((Date.now() - seedT0) / 1000).toFixed(1)}s`,
    );
    if (createdIds.length < N_POINT) {
      throw new Error(`probe: seeded ${createdIds.length}, need >= ${N_POINT}`);
    }
    await stabilize(400);

    // ── Baseline snapshot ───────────────────────────────────────────────
    const baseline = await snapshotServer(baseUrl, headers);
    let prev = baseline;
    console.log(
      `[snapshot] baseline: cm size=${prev.cm?.overall.size ?? "n/a"} hits=${prev.cm?.overall.hits ?? "n/a"} | rss=${num(prev.health?.memory?.rss) > 0 ? fmtMb(num(prev.health?.memory?.rss)) : "n/a"}`,
    );

    const rows: TierRow[] = [];

    // ── Phase A: point-read FIFO ────────────────────────────────────────
    const point = await phasePoint(collectionUrl, headers, createdIds, N_POINT);
    let next = await snapshotServer(baseUrl, headers);
    let d = snapshotDelta(prev, next);
    {
      const perEntry = point.distinctKeys > 0 ? point.bodyBytes / (point.distinctKeys * 3) : 0;
      rows.push({
        tier: "point-read FIFO (responseCache.pointL1)",
        drivenBy: `${N_POINT} distinct ids ×3 passes`,
        entries: `${point.verifiedHits}/${N_POINT} ids verified resident (tier size NOT exposed over HTTP)`,
        size: `est. ≈ ${fmtMb(perEntry * 3 * 2000)} resident @ 2000 slots (${(perEntry / 1024).toFixed(1)} KB/entry ×3 copies)`,
        hits: `${distLine(point.cacheDist)} | cacheService Δ ${d.cmHits} hits (expect ≈0: lane uses skipCacheService)`,
        misses: `${d.cmMisses} misses Δ (cacheService)`,
        rssMb: d.rssMb.toFixed(1),
        heapMb: d.heapMb.toFixed(1),
      });
    }
    console.log(
      `[phase] ${point.label}: ${point.reqs} reqs in ${(point.wallMs / 1000).toFixed(1)}s | ${distLine(point.cacheDist)}`,
    );
    for (const n of point.notes) console.log(`         ${n}`);
    prev = next;

    // ── Phase B: list tier ───────────────────────────────────────────────
    const list = await phaseList(collectionUrl, headers, N_LIST);
    next = await snapshotServer(baseUrl, headers);
    d = snapshotDelta(prev, next);
    {
      const perEntry = list.distinctKeys > 0 ? list.bodyBytes / (list.distinctKeys * 2) : 0;
      rows.push({
        tier: "list tier (responseCache.localL1)",
        drivenBy: `${N_LIST} unique list URLs ×2 passes`,
        entries: `${list.verifiedHits}/${N_LIST} URLs verified resident | cacheService l1 size Δ ${d.cmSize} entries (mirror writes)`,
        size: `est. ≈ ${fmtMb(perEntry * 3 * N_LIST)} for ${N_LIST} bodies (${(perEntry / 1024).toFixed(1)} KB/entry ×3 copies)`,
        hits: `${d.cmHits} hits Δ (≈${N_LIST - 1}: one canonical find key)`,
        misses: `${d.cmMisses} misses Δ (≈1 canonical find key)`,
        rssMb: d.rssMb.toFixed(1),
        heapMb: d.heapMb.toFixed(1),
      });
    }
    console.log(
      `[phase] ${list.label}: ${list.reqs} reqs in ${(list.wallMs / 1000).toFixed(1)}s | ${distLine(list.cacheDist)}`,
    );
    for (const n of list.notes) console.log(`         ${n}`);
    prev = next;

    // ── Phase C: L1 content cache (cacheService) ─────────────────────────
    const l1 = await phaseL1(collectionUrl, headers, N_L1);
    next = await snapshotServer(baseUrl, headers);
    d = snapshotDelta(prev, next);
    rows.push({
      tier: "L1 content cache (cacheService.l1 LRU)",
      drivenBy: `${N_L1} identical refresh=true list GETs`,
      entries: `${d.cmSize} entries Δ (size field = L1 LRU entry count)`,
      size: "not exposed over HTTP (entry count only)",
      hits: `${d.cmHits} hits Δ (≈${N_L1 - 1} served from L1 content cache)`,
      misses: `${d.cmMisses} misses Δ`,
      rssMb: d.rssMb.toFixed(1),
      heapMb: d.heapMb.toFixed(1),
    });
    console.log(
      `[phase] ${l1.label}: ${l1.reqs} reqs in ${(l1.wallMs / 1000).toFixed(1)}s | ${distLine(l1.cacheDist)}`,
    );
    for (const n of l1.notes) console.log(`         ${n}`);
    prev = next;

    // ── Phase D: GraphQL response/schema cache ───────────────────────────
    const gql = await phaseGraphql(baseUrl, headers, N_GQL);
    next = await snapshotServer(baseUrl, headers);
    d = snapshotDelta(prev, next);
    rows.push({
      tier: "graphql response/schema cache",
      drivenBy: `${N_GQL} identical GraphQL POSTs`,
      entries: "not exposed over HTTP",
      size: "not exposed over HTTP",
      hits: `responseHits Δ ${d.gqlResponseHits} | schemaHits Δ ${d.gqlSchemaHits}`,
      misses: `responseMisses Δ ${d.gqlResponseMisses} | schemaMisses Δ ${d.gqlSchemaMisses}`,
      rssMb: d.rssMb.toFixed(1),
      heapMb: d.heapMb.toFixed(1),
    });
    console.log(
      `[phase] ${gql.label}: ${gql.reqs} reqs in ${(gql.wallMs / 1000).toFixed(1)}s | ${distLine(gql.cacheDist)}`,
    );
    for (const n of gql.notes) console.log(`         ${n}`);

    // ── Final snapshot ───────────────────────────────────────────────────
    const finalSnap = await snapshotServer(baseUrl, headers);
    const total = snapshotDelta(baseline, finalSnap);
    console.log(
      `[snapshot] final: cm size=${finalSnap.cm?.overall.size ?? "n/a"} hits=${finalSnap.cm?.overall.hits ?? "n/a"} | rss=${num(finalSnap.health?.memory?.rss) > 0 ? fmtMb(num(finalSnap.health?.memory?.rss)) : "n/a"} (Δ vs baseline ${total.rssMb.toFixed(1)} MB)`,
    );

    printTierTable(rows);
  } finally {
    if (stop) await stop();
  }
}, 600_000);
