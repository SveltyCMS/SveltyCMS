/**
 * @file tests/benchmarks/index-write-amplification-ab.test.ts
 * @description Paired A/B: does the legacy prefix-duplicate collection index
 * (`(tenantId, status, updatedAt)` — a strict prefix of the covering composite
 * `(tenantId, status, updatedAt, _id)` that pre-policy createModel shipped)
 * measurably slow the write lanes once durability is relaxed?
 *
 * Fresh createModel tables no longer ship the duplicate (the covering-composite
 * policy tightened in §3.41), but tables created before that still carry it.
 * This A/B adds the legacy index back to a fresh table (fresh policy vs legacy
 * shape) and alternates arms in pairs with a PK point-read control lane to
 * cancel host drift, on both MariaDB and PostgreSQL.
 *
 * Run: DB_TYPE=mariadb SVELTY_BENCHMARK_SERVER_MODE=production \
 *        bun test tests/benchmarks/index-write-amplification-ab.test.ts
 */

import {
  test,
  runBenchmark,
  exportMetric,
  setupBenchmarkServer,
  stabilize,
  assertSuccess,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { toQueryOptions } from "@src/databases/policy";
import { generateUUID } from "@utils/native-utils";

const TEST_TENANT = "global";
const DOCS_PER_VARIANT = 2000;
const PAIRS = 4;
const WARMUP = 30;
const ITERATIONS = 250;
// 8c shares the iteration cursor across workers (runBenchmark semantics), so
// the concurrent lane needs more total iterations for a statistically useful
// per-worker sample (~50/worker at 400).
const ITERATIONS_CON = 400;
const CONCURRENCY = 8;

// Legacy pre-policy artifact still present on tables created before the
// covering-composite policy tightened (§3.41): a strict-prefix duplicate of
// the (tenantId, status, updatedAt, _id) composite. Fresh createModel tables
// do NOT ship it anymore — this A/B measures whether old tables should drop it.
const LEGACY_SUFFIX = "tenant_status_updated";

const GLOBAL_TENANT_OPTS = Object.freeze({
  ...toQueryOptions({ bypassCache: true }),
  tenantId: TEST_TENANT,
});

let stopServer: (() => Promise<void>) | null = null;

function gcSync() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

/** Raw SQL executor via the adapter's `raw.execute` (ISqlAdapter). */
function rawExecOf(db: unknown): (sqlText: string) => Promise<unknown> {
  const adapter = db as {
    raw?: { execute: (sql: string, params?: unknown[]) => Promise<unknown> };
  };
  const raw = adapter.raw;
  if (!raw) throw new Error("Adapter has no raw.execute — SQL adapters only");
  return (sqlText: string) => raw.execute(sqlText);
}

function countIndexes(db: unknown, tableName: string): Promise<number> {
  const dbType = (db as { type?: string }).type;
  const isMaria = dbType === "mariadb" || dbType === "mysql";
  // Engine-specific catalog: each adapter exposes a different system view for
  // "indexes on this table". SQLite has no `pg_indexes` — the previous code ran
  // the PostgreSQL query unconditionally and threw "no such table: pg_indexes".
  const sqlText =
    dbType === "sqlite"
      ? `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND tbl_name = '${tableName}'`
      : isMaria
        ? `SELECT COUNT(DISTINCT index_name) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${tableName}'`
        : `SELECT COUNT(*) AS n FROM pg_indexes WHERE schemaname = current_schema() AND tablename = '${tableName}'`;
  return rawExecOf(db)(sqlText).then((rawRows) => {
    const rows = rawRows as Array<{ n?: number; count?: number }>;
    const first = Array.isArray(rows) ? rows[0] : (rawRows as { n?: number; count?: number });
    return Number(first?.n ?? first?.count ?? 0);
  });
}

/** Add the legacy prefix-duplicate index to a fresh table (the pre-policy shape). */
async function addLegacyIndex(db: unknown, collectionId: string): Promise<void> {
  const tableName = `collection_${collectionId}`;
  const indexName = `${tableName}_${LEGACY_SUFFIX}`;
  const dbType = (db as { type?: string }).type;
  const q = dbType === "mariadb" || dbType === "mysql" ? "`" : '"';
  await rawExecOf(db)(
    `CREATE INDEX ${q}${indexName}${q} ON ${q}${tableName}${q} (${q}tenantId${q}, ${q}status${q}, ${q}updatedAt${q})`,
  );
}

async function prepareVariant(db: any, collectionId: string): Promise<void> {
  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: collectionId,
        name: collectionId,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "value", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }
}

async function seedVariant(db: any, collectionId: string): Promise<string[]> {
  const ids: string[] = [];
  const CHUNK = 500;
  for (let start = 0; start < DOCS_PER_VARIANT; start += CHUNK) {
    const batch = Array.from({ length: Math.min(CHUNK, DOCS_PER_VARIANT - start) }, (_, i) => {
      const id = generateUUID();
      ids.push(id);
      return {
        _id: id,
        title: `A/B seed ${collectionId} ${start + i}`,
        status: (start + i) % 3 === 0 ? "draft" : "published",
        value: (start + i) % 1000,
        metadata: { keep: `k${start + i}` },
        tenantId: TEST_TENANT,
      };
    });
    const res = await db.crud.insertMany(collectionId, batch, GLOBAL_TENANT_OPTS);
    assertSuccess(res, `seed ${collectionId}`);
  }
  return ids;
}

function makeLanes(db: any, collectionId: string, ids: string[]) {
  let cursor = 0;
  const update = async () => {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const seq = cursor++;
    const res = await db.crud.update(
      collectionId,
      id,
      {
        title: `A/B update ${seq}`,
        status: seq % 3 === 0 ? "draft" : "published",
        value: (seq * 7 + 1) % 1000,
      },
      GLOBAL_TENANT_OPTS,
    );
    assertSuccess(res, `update ${collectionId}`);
  };
  const create = async () => {
    const seq = cursor++;
    const res = await db.crud.insert(
      collectionId,
      {
        _id: generateUUID(),
        title: `A/B create ${seq}`,
        status: seq % 2 === 0 ? "draft" : "published",
        value: seq % 1000,
        tenantId: TEST_TENANT,
      },
      GLOBAL_TENANT_OPTS,
    );
    assertSuccess(res, `create ${collectionId}`);
  };
  const findById = async () => {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const res = await db.crud.findOne(collectionId, { _id: id as any }, GLOBAL_TENANT_OPTS);
    assertSuccess(res, `findById ${collectionId}`);
  };
  return { update, create, findById };
}

test("Index write-amplification A/B (fresh policy vs legacy index)", async () => {
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    await stabilize(500);

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    if (db.type === "mongodb") {
      console.log("   ⏭️ Skipping index-write-amplification-ab on MongoDB (SQL raw.execute only)");
      return;
    }

    const freshId = "ab_index_fresh";
    const legacyId = "ab_index_legacy";
    await prepareVariant(db, freshId);
    await prepareVariant(db, legacyId);

    const freshIndexes = await countIndexes(db, `collection_${freshId}`);
    const legacyBefore = await countIndexes(db, `collection_${legacyId}`);
    if (freshIndexes !== legacyBefore) {
      throw new Error(
        `Index count mismatch before adding legacy index (fresh: ${freshIndexes}, legacy: ${legacyBefore})`,
      );
    }
    await addLegacyIndex(db, legacyId);
    const legacyAfter = await countIndexes(db, `collection_${legacyId}`);
    if (legacyAfter !== freshIndexes + 1) {
      throw new Error(
        `Legacy index add did not produce exactly one extra index (fresh: ${freshIndexes}, legacy after: ${legacyAfter})`,
      );
    }
    logger.info(
      `🔬 Index A/B: fresh-policy=${freshIndexes} indexes, legacy=${legacyAfter} (added "${LEGACY_SUFFIX}" — the pre-policy prefix duplicate)\n`,
    );
    console.log(
      `🔬 Index A/B: fresh-policy=${freshIndexes} indexes, legacy=${legacyAfter} (added "${LEGACY_SUFFIX}" — the pre-policy prefix duplicate)\n`,
    );

    const freshIds = await seedVariant(db, freshId);
    const legacyIds = await seedVariant(db, legacyId);
    // Equalize planner statistics: the legacy table's CREATE INDEX recomputed
    // its stats post-seed while the fresh table's stats are from an empty
    // table — a stats skew would make INSERT/UPDATE lane deltas unreadable.
    const dbType = (db as { type?: string }).type;
    const isMaria = dbType === "mariadb" || dbType === "mysql";
    const q = isMaria ? "`" : '"';
    // SQLite's ANALYZE takes a single table (or none) — a comma-separated list
    // is PostgreSQL/MariaDB syntax and fails with `near ",": syntax error`.
    if (dbType === "sqlite") {
      await rawExecOf(db)(`ANALYZE ${q}collection_${freshId}${q}`);
      await rawExecOf(db)(`ANALYZE ${q}collection_${legacyId}${q}`);
    } else {
      const analyzeSql = isMaria
        ? `ANALYZE TABLE ${q}collection_${freshId}${q}, ${q}collection_${legacyId}${q}`
        : `ANALYZE ${q}collection_${freshId}${q}, ${q}collection_${legacyId}${q}`;
      await rawExecOf(db)(analyzeSql);
    }
    const freshLanes = makeLanes(db, freshId, freshIds);
    const legacyLanes = makeLanes(db, legacyId, legacyIds);

    type Row = { variant: string; avgMs: number; p95Ms: number; rps: number };
    interface Bucket {
      fresh: Row[];
      legacy: Row[];
      control: number[];
    }
    const rows: Record<string, Bucket> = {
      "update 1c": { fresh: [], legacy: [], control: [] },
      "update 8c": { fresh: [], legacy: [], control: [] },
      "create 1c": { fresh: [], legacy: [], control: [] },
    };

    for (let pair = 0; pair < PAIRS; pair++) {
      const order: Array<{ label: "fresh" | "legacy"; lanes: typeof freshLanes }> =
        pair % 2 === 0
          ? [
              { label: "fresh", lanes: freshLanes },
              { label: "legacy", lanes: legacyLanes },
            ]
          : [
              { label: "legacy", lanes: legacyLanes },
              { label: "fresh", lanes: freshLanes },
            ];

      for (const arm of order) {
        const bucket = arm.label === "fresh" ? rows["update 1c"].fresh : rows["update 1c"].legacy;
        const seq = await runBenchmark({
          name: `A/B update 1c [${arm.label}] pair ${pair}`,
          warmupIterations: WARMUP,
          iterations: ITERATIONS,
          concurrency: 1,
          onIteration: arm.lanes.update,
        });
        bucket.push({ variant: arm.label, avgMs: seq.avgMs, p95Ms: seq.p95Ms, rps: seq.rps });

        const conBucket =
          arm.label === "fresh" ? rows["update 8c"].fresh : rows["update 8c"].legacy;
        const con = await runBenchmark({
          name: `A/B update 8c [${arm.label}] pair ${pair}`,
          warmupIterations: WARMUP,
          iterations: ITERATIONS_CON,
          concurrency: CONCURRENCY,
          onIteration: arm.lanes.update,
        });
        conBucket.push({ variant: arm.label, avgMs: con.avgMs, p95Ms: con.p95Ms, rps: con.rps });

        const createBucket =
          arm.label === "fresh" ? rows["create 1c"].fresh : rows["create 1c"].legacy;
        const created = await runBenchmark({
          name: `A/B create 1c [${arm.label}] pair ${pair}`,
          warmupIterations: WARMUP,
          iterations: ITERATIONS,
          concurrency: 1,
          onIteration: arm.lanes.create,
        });
        createBucket.push({
          variant: arm.label,
          avgMs: created.avgMs,
          p95Ms: created.p95Ms,
          rps: created.rps,
        });

        // Control: PK point read — index-set independent, carries host drift.
        const controlLane = arm.label === "fresh" ? freshLanes.findById : legacyLanes.findById;
        const ctrl = await runBenchmark({
          name: `A/B control findById [${arm.label}] pair ${pair}`,
          warmupIterations: WARMUP,
          iterations: ITERATIONS,
          concurrency: 1,
          onIteration: controlLane,
        });
        for (const key of Object.keys(rows)) {
          rows[key].control.push(ctrl.rps);
        }
      }
      gcSync();
      await stabilize(200);
    }

    // ── Verdict ────────────────────────────────────────────────────────────
    const median = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const pct = (a: number, b: number) => (((a - b) / b) * 100).toFixed(1);

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  INDEX WRITE-AMPLIFICATION A/B — fresh policy vs legacy       ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    for (const [lane, bucket] of Object.entries(rows)) {
      const fRps = median(bucket.fresh.map((r) => r.rps));
      const lRps = median(bucket.legacy.map((r) => r.rps));
      const fMs = median(bucket.fresh.map((r) => r.avgMs));
      const lMs = median(bucket.legacy.map((r) => r.avgMs));
      const ctrlSpread =
        bucket.control.length >= 2
          ? ((Math.max(...bucket.control) - Math.min(...bucket.control)) / median(bucket.control)) *
            100
          : 0;
      const delta = pct(lRps, fRps);
      const verdict =
        Math.abs(parseFloat(delta)) <= Math.max(20, ctrlSpread)
          ? "lane-neutral (≤ control drift)"
          : "⚠️ outside control drift";
      console.log(
        `║ ${lane.padEnd(9)} │ fresh ${fMs.toFixed(3)}ms/${fRps.toFixed(0)} RPS │ legacy ${lMs.toFixed(3)}ms/${lRps.toFixed(0)} RPS │ legacy Δ ${delta}% │ ctrl drift ${ctrlSpread.toFixed(0)}% │ ${verdict}`,
      );
      exportMetric(`index_ab.${lane.replace(" ", "_")}.fresh.rps`, +fRps.toFixed(1), "req/s");
      exportMetric(`index_ab.${lane.replace(" ", "_")}.legacy.rps`, +lRps.toFixed(1), "req/s");
    }
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // Cleanup: drop both tables so repeated runs start from a clean policy set.
    for (const cid of [freshId, legacyId]) {
      const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
      try {
        await rawExecOf(db)(`DROP TABLE IF EXISTS ${q}collection_${cid}${q}`);
      } catch {}
    }
  } finally {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  }
}, 900_000);
