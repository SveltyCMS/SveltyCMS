/**
 * @file scripts/benchmark-matrix/probe-write-index-cost.ts
 * @description Controlled A/B: driver-level write floor with 4 vs 12+ (realistic CMS) indexes.
 * @summary Measures how much of the create/update gap vs the raw driver ceiling is
 * index maintenance (GIN jsonb + per-column indexes) rather than app work.
 */

import postgres from "postgres";

const ROWS = 100_000;
const CONCURRENCY = 8;
const MEASURE_MS = 3_000;
const WARMUP_MS = 1_000;

const sql = postgres("postgres://postgres:postgres@127.0.0.1:5432/postgres", {
  max: 12,
  connect_timeout: 5,
  prepare: true,
});

/** Monotonic id sequence across bench invocations so repeated insert phases never collide. */
let benchSeq = 0;

function makeTable(name: string): string {
  return `"${name}"`;
}

async function createTables(): Promise<void> {
  await sql.unsafe(`DROP TABLE IF EXISTS bench_lean`);
  await sql.unsafe(`DROP TABLE IF EXISTS bench_realistic`);
  // Lean: the ceiling tool's own 4-index shape — same column set as the
  // realistic table so the ONLY difference is the index count.
  await sql.unsafe(`
    CREATE TABLE bench_lean (
      _id TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      "isDeleted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" BIGINT NOT NULL,
      "updatedAt" BIGINT NOT NULL,
      slug TEXT,
      "publishedAt" TEXT,
      collection TEXT,
      locale TEXT
    )`);
  await sql.unsafe(`CREATE INDEX bench_lean_tenant_status ON bench_lean ("tenantId", status)`);
  await sql.unsafe(`CREATE INDEX bench_lean_updated ON bench_lean ("updatedAt" DESC)`);
  await sql.unsafe(
    `CREATE INDEX bench_lean_tenant_status_updated ON bench_lean ("tenantId", status, "updatedAt" DESC)`,
  );
  await sql.unsafe(
    `CREATE INDEX bench_lean_tenant_updated ON bench_lean ("tenantId", "updatedAt" DESC)`,
  );

  // Realistic: the 12-index shape the CMS provisions for a dynamic collection.
  await sql.unsafe(`
    CREATE TABLE bench_realistic (
      _id TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      "isDeleted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" BIGINT NOT NULL,
      "updatedAt" BIGINT NOT NULL,
      slug TEXT,
      "publishedAt" TEXT,
      collection TEXT,
      locale TEXT
    )`);
  const idx = [
    `bench_realistic_tenant_status_collection_id ON bench_realistic ("tenantId", status, collection DESC, _id DESC)`,
    `bench_realistic_tenant_status_slug_id ON bench_realistic ("tenantId", status, slug DESC, _id DESC)`,
    `bench_realistic_publishedAt_idx ON bench_realistic ("publishedAt")`,
    `bench_realistic_tenant_updated_id ON bench_realistic ("tenantId", "updatedAt" DESC, _id DESC)`,
    `bench_realistic_slug_idx ON bench_realistic (slug)`,
    `bench_realistic_tenant_status_publishedAt_id ON bench_realistic ("tenantId", status, "publishedAt" DESC, _id DESC)`,
    `bench_realistic_data_gin ON bench_realistic USING gin (data jsonb_path_ops)`,
    `bench_realistic_collection_idx ON bench_realistic (collection)`,
    `bench_realistic_locale_idx ON bench_realistic (locale)`,
    `bench_realistic_tenant_status_locale_id ON bench_realistic ("tenantId", status, locale DESC, _id DESC)`,
    `bench_realistic_tenant_status_updated_id ON bench_realistic ("tenantId", status, "updatedAt" DESC, _id DESC)`,
    `bench_realistic_tenant_status_updated ON bench_realistic ("tenantId", status, "updatedAt" DESC)`,
  ];
  for (const i of idx) await sql.unsafe(`CREATE INDEX ${i}`);
}

async function seed(table: string): Promise<void> {
  const CHUNK = 500;
  const now = Date.now();
  for (let start = 0; start < ROWS; start += CHUNK) {
    const n = Math.min(CHUNK, ROWS - start);
    const rows: Array<Array<string | number | null>> = Array.from({ length: n });
    for (let i = 0; i < n; i++) {
      const k = start + i;
      rows[i] = [
        `seed-${k}`,
        "global",
        JSON.stringify({ count: k % 1000, title: `t${k}`, body: "x".repeat(200) }),
        k % 3 === 0 ? "draft" : "published",
        0,
        `slug-${k}`,
        `2026-01-01T00:00:00.000Z`,
        "bench",
        "en",
        now,
        now,
      ];
    }
    const valuesSql = rows
      .map((_, i) => {
        const b = i * 11;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      })
      .join(",");
    await sql.unsafe(
      `INSERT INTO ${makeTable(table)} (_id, "tenantId", data, status, "isDeleted", slug, "publishedAt", collection, locale, "createdAt", "updatedAt") VALUES ${valuesSql}`,
      rows.flat(),
    );
  }
}

async function bench(table: string, op: "insert" | "update", returning = false): Promise<number> {
  const now = Date.now();
  const phase = benchSeq++;
  let counter = 0;
  const invoke = async (w: number) => {
    if (op === "insert") {
      const id = `w${phase}-${w}-${counter++}`;
      await sql.unsafe(
        `INSERT INTO ${makeTable(table)} (_id, "tenantId", data, status, "isDeleted", slug, "publishedAt", collection, locale, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)${returning ? " RETURNING *" : ""}`,
        [
          id,
          "global",
          JSON.stringify({ count: counter % 1000, title: `i${counter}`, body: "x".repeat(200) }),
          "published",
          0,
          `slug-${id}`,
          `2026-01-01T00:00:00.000Z`,
          "bench",
          "en",
          now,
          now,
        ],
      );
    } else {
      const id = `seed-${Math.floor(Math.random() * ROWS)}`;
      await sql.unsafe(
        `UPDATE ${makeTable(table)} SET data = $1, "updatedAt" = $2 WHERE _id = $3 AND "tenantId" = $4${returning ? " RETURNING *" : ""}`,
        [
          JSON.stringify({ count: counter % 1000, title: "u", body: "y".repeat(200) }),
          now,
          id,
          "global",
        ],
      );
    }
  };
  // warmup
  const warmEnd = performance.now() + WARMUP_MS;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (performance.now() < warmEnd) await invoke(0);
    }),
  );
  const start = performance.now();
  const deadline = start + MEASURE_MS;
  const counts = Array.from({ length: CONCURRENCY }, () => 0);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, w) => {
      while (performance.now() < deadline) {
        await invoke(w);
        counts[w]++;
      }
    }),
  );
  const ops = counts.reduce((a, b) => a + b, 0);
  const durationMs = performance.now() - start;
  return Math.round((ops / durationMs) * 1000);
}

async function main() {
  console.log(
    `\n=== WRITE INDEX-COST PROBE (${ROWS.toLocaleString()} rows, ${CONCURRENCY}c, PG) ===`,
  );
  console.log("creating tables (4-index lean vs 12-index realistic)...");
  await createTables();
  console.log("seeding bench_lean...");
  await seed("bench_lean");
  console.log("seeding bench_realistic...");
  await seed("bench_realistic");

  const leanIns = await bench("bench_lean", "insert");
  const realIns = await bench("bench_realistic", "insert");
  const realInsRet = await bench("bench_realistic", "insert", true);
  const leanUpd = await bench("bench_lean", "update");
  const realUpd = await bench("bench_realistic", "update");
  const realUpdRet = await bench("bench_realistic", "update", true);

  console.log(`\n| op      | lean (4 idx) | realistic (12 idx + GIN) | + RETURNING * |`);
  console.log(`| ------- | -----------: | -----------------------: | ------------: |`);
  console.log(
    `| insert  | ${leanIns.toLocaleString()} RPS | ${realIns.toLocaleString()} RPS | ${realInsRet.toLocaleString()} RPS (${((realInsRet / realIns) * 100).toFixed(0)}%) |`,
  );
  console.log(
    `| update  | ${leanUpd.toLocaleString()} RPS | ${realUpd.toLocaleString()} RPS | ${realUpdRet.toLocaleString()} RPS (${((realUpdRet / realUpd) * 100).toFixed(0)}%) |`,
  );
  await sql.unsafe(`DROP TABLE IF EXISTS bench_lean`);
  await sql.unsafe(`DROP TABLE IF EXISTS bench_realistic`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
