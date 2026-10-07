/**
 * @file tests/benchmarks/probe-query-builder-ab.test.ts
 * @description A/B of the shared SQL query builder's execution paths.
 *
 * The builder has two ways to run the *same* logical query:
 *
 *   Arm A — `compile()` + `adapter.executeCompiled(sql, params)`:
 *           the statement text is assembled once per query *shape* and cached,
 *           then run through the driver's prepared-statement cache.
 *   Arm B — Drizzle dynamic AST (`db.select()...$dynamic()`):
 *           the query is rebuilt and re-compiled by Drizzle on every call.
 *
 * The only difference between the arms is a single truthiness check
 * (`SqlQueryBuilderCore.executeCompiled`), so any delta is the translation /
 * execution overhead — not the SQL plan, not the filters, not the index set.
 *
 * Three groups of lanes are measured, alternating arms in pairs with a
 * PK point-read control lane to cancel host drift:
 *   1. `compilable`  — equality + physical ORDER BY + limit   (A vs B differ)
 *   2. `operators`   — search (LIKE, still Drizzle-only) plus the physical-column
 *                      forms of whereBetween / orWhere / whereIn (now compile,
 *                      so arms A/B genuinely differ for those lanes)
 *   3. `controls`    — PK findOne and crud.update (never touch the builder)
 *
 * Diagnostic probe — excluded from the matrix (SKIP_IN_MATRIX). Writes no
 * ledger metrics; the result is the printed table.
 *
 * Run:
 *   DB_TYPE=postgresql SVELTY_BENCHMARK_SERVER_MODE=production \
 *     SVELTY_LAZY_SORT_INDEXES=0 bun test tests/benchmarks/probe-query-builder-ab.test.ts
 */

import { sql } from "drizzle-orm";
import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  getDbType,
  assertSuccess,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { toQueryOptions } from "@src/databases/policy";
import { generateUUID } from "@utils/native-utils";
import {
  SqlQueryBuilder,
  MARIADB_DIALECT,
  POSTGRES_DIALECT,
  SQLITE_DIALECT,
  type SqlDialect,
} from "@src/databases/core/sql-query-builder";

const COLLECTION_ID = "qb_ab_probe";
const TEST_TENANT = "global";
const SEED_ROWS = Number(process.env.QB_AB_SEED || 2000);
const PAIRS = Number(process.env.QB_AB_PAIRS || 3);
const WARMUP = Number(process.env.QB_AB_WARMUP || 40);
const ITERATIONS = Number(process.env.QB_AB_ITER || 300);
const SORT_FIELD = "createdAt";

const OPTS = Object.freeze({
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

function dialectFor(dbType: string): SqlDialect {
  if (dbType === "postgresql") return POSTGRES_DIALECT;
  if (dbType === "mariadb" || dbType === "mysql") return MARIADB_DIALECT;
  return SQLITE_DIALECT;
}

/**
 * Arm B core: the same adapter with `executeCompiled` hidden, so `compile()`
 * returns null and the builder falls through to the Drizzle dynamic AST. Every
 * other access is forwarded, bound to the real adapter so `this` stays correct.
 */
function drizzleOnlyCore(adapter: any): any {
  return new Proxy(adapter, {
    get(target, prop) {
      if (prop === "executeCompiled") return undefined;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

interface LaneCtx {
  ids: string[];
  db: any;
}

type LaneBuilder = (core: any, dialect: SqlDialect, ctx: LaneCtx) => () => Promise<void>;

/**
 * Each lane receives a *fresh* builder — the builder is mutable/stateful, so a
 * cached instance across iterations would measure chained state, not a call.
 */
const LANES: Array<{
  group: "compilable" | "operators" | "controls";
  name: string;
  build: LaneBuilder;
}> = [
  {
    group: "compilable",
    name: "list eq+sort+limit",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT, status: "published" } as any)
        .sort(SORT_FIELD, "desc")
        .paginate({ page: 1, pageSize: 50 })
        .execute()
        .then((r) => assertSuccess(r, "list")),
  },
  {
    group: "compilable",
    name: "count",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT, status: "published" } as any)
        .count()
        .then((r) => assertSuccess(r, "count")),
  },
  {
    group: "compilable",
    name: "findOne eq",
    build: (core, dialect, ctx) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ _id: ctx.ids[0] } as any)
        .findOne()
        .then((r) => assertSuccess(r, "findOne")),
  },
  {
    group: "operators",
    name: "search(LIKE) title",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .search("row", ["title"] as any)
        .where({ tenantId: TEST_TENANT } as any)
        .limit(50)
        .execute()
        .then((r) => assertSuccess(r, "search")),
  },
  {
    group: "operators",
    name: "whereBetween value",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT } as any)
        .whereBetween("value" as any, 10 as any, 20 as any)
        .limit(50)
        .execute()
        .then((r) => assertSuccess(r, "whereBetween")),
  },
  {
    group: "operators",
    name: "orWhere status x2",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT } as any)
        .orWhere([{ status: "draft" }, { status: "published" }])
        .limit(50)
        .execute()
        .then((r) => assertSuccess(r, "orWhere")),
  },
  {
    group: "operators",
    name: "whereIn status x2",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT } as any)
        .whereIn("status" as any, ["draft", "published"] as any)
        .limit(50)
        .execute()
        .then((r) => assertSuccess(r, "whereIn")),
  },
  {
    group: "operators",
    name: "whereIn count",
    build: (core, dialect) => () =>
      new SqlQueryBuilder(core, COLLECTION_ID, dialect)
        .where({ tenantId: TEST_TENANT } as any)
        .whereIn("status" as any, ["draft", "published"] as any)
        .count()
        .then((r) => assertSuccess(r, "whereIn count")),
  },
  {
    group: "controls",
    name: "control findOne PK",
    build: (_core, _dialect, ctx) => () =>
      ctx.db.crud
        .findOne(COLLECTION_ID, { _id: ctx.ids[1] }, OPTS)
        .then((r: any) => assertSuccess(r, "control findOne")),
  },
  {
    group: "controls",
    name: "control crud.update",
    build: (_core, _dialect, ctx) => {
      let n = 0;
      return () =>
        ctx.db.crud
          .update(COLLECTION_ID, ctx.ids[2], { title: `ab-update-${n++}` }, OPTS)
          .then((r: any) => assertSuccess(r, "control update"));
    },
  },
];

async function prepareCollection(db: any): Promise<void> {
  const tableName = `collection_${COLLECTION_ID}`;
  const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
  if (db.collection?.createModel) {
    if (db.type !== "mongodb") {
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${q}${tableName}${q}`));
      } catch {}
    }
    await db.collection
      .createModel({
        _id: COLLECTION_ID,
        name: COLLECTION_ID,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "value", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch((err: unknown) => logger.debug(`createModel: ${String(err)}`));

    try {
      await db.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS ${q}idx_qbab_status${q} ON ${q}${tableName}${q} (${q}status${q})`,
        ),
      );
      await db.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS ${q}idx_qbab_tenant${q} ON ${q}${tableName}${q} (${q}tenantId${q})`,
        ),
      );
    } catch {}
  }
}

async function seedRows(db: any): Promise<string[]> {
  const ids: string[] = [];
  const CHUNK = 500;
  for (let start = 0; start < SEED_ROWS; start += CHUNK) {
    const batch = Array.from({ length: Math.min(CHUNK, SEED_ROWS - start) }, (_, i) => {
      const id = generateUUID();
      ids.push(id);
      const n = start + i;
      return {
        _id: id,
        title: `query builder ab row ${n}`,
        status: n % 3 === 0 ? "draft" : n % 7 === 0 ? "archived" : "published",
        value: n % 100,
        tenantId: TEST_TENANT,
      };
    });
    const res = await db.crud.insertMany(COLLECTION_ID, batch, OPTS);
    assertSuccess(res, "seed");
  }
  return ids;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

test("Query builder A/B — compiled prepared path vs Drizzle dynamic AST", async () => {
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    if (db.type === "mongodb") {
      console.log("   ⏭️ Skipping query-builder A/B on MongoDB (SQL builder only)");
      return;
    }

    const dbType = getDbType();
    const dialect = dialectFor(dbType);

    await prepareCollection(db);
    const ids = await seedRows(db);
    try {
      const analyzeTable = dialect.quoteIdent(`collection_${COLLECTION_ID}`);
      const analyzeSql =
        db.type === "mariadb" || db.type === "mysql"
          ? `ANALYZE TABLE ${analyzeTable}`
          : `ANALYZE ${analyzeTable}`;
      await (db as any).execute(sql.raw(analyzeSql));
    } catch {}
    await new Promise((r) => setTimeout(r, 300));

    const coreA = db; // compiled path available
    const coreB = drizzleOnlyCore(db); // Drizzle-only fallback
    const ctxBase: LaneCtx = { ids, db };

    type Bucket = { a: number[]; b: number[]; ctrl: number[]; aMs: number[]; bMs: number[] };
    const rows: Record<string, Bucket> = {};
    for (const lane of LANES) rows[lane.name] = { a: [], b: [], ctrl: [], aMs: [], bMs: [] };

    for (let pair = 0; pair < PAIRS; pair++) {
      const order: Array<"A" | "B"> = pair % 2 === 0 ? ["A", "B"] : ["B", "A"];
      for (const arm of order) {
        for (const lane of LANES) {
          const core = lane.group === "controls" ? ctxBase : arm === "A" ? coreA : coreB;
          const fn = lane.build(core, dialect, ctxBase);
          const res = await runBenchmark({
            name: `qb-ab [${lane.name}] ${arm} pair ${pair}`,
            warmupIterations: WARMUP,
            iterations: ITERATIONS,
            concurrency: 1,
            silent: true,
            onIteration: fn,
          });
          const bucket = rows[lane.name];
          if (arm === "A") {
            bucket.a.push(res.rps);
            bucket.aMs.push(res.avgMs);
          } else {
            bucket.b.push(res.rps);
            bucket.bMs.push(res.avgMs);
          }
          if (lane.group === "controls") bucket.ctrl.push(res.rps);
        }
      }
      gcSync();
      await new Promise((r) => setTimeout(r, 150));
    }

    const pct = (a: number, b: number) => (b === 0 ? "n/a" : (((a - b) / b) * 100).toFixed(1));
    const ctrlSpread =
      rows["control findOne PK"].ctrl.length >= 2
        ? ((Math.max(...rows["control findOne PK"].ctrl) -
            Math.min(...rows["control findOne PK"].ctrl)) /
            median(rows["control findOne PK"].ctrl)) *
          100
        : 0;

    console.log(
      "\n╔══════════════════════════════════════════════════════════════════════════════════════════╗",
    );
    console.log(
      `║  QUERY BUILDER A/B (${dbType}) — A: compiled+prepared vs B: Drizzle dynamic AST           `,
    );
    console.log(
      `║  seed=${SEED_ROWS} rows  pairs=${PAIRS}  iters=${ITERATIONS}  ctrl drift=${ctrlSpread.toFixed(0)}%`,
    );
    console.log(
      "╠══════════════════════════════════════════════════════════════════════════════════════════╣",
    );
    console.log(
      "║ lane                      group       A ms     A RPS    B ms     B RPS   ΔRPS(A/B)  verdict",
    );
    console.log(
      "╠══════════════════════════════════════════════════════════════════════════════════════════╣",
    );
    for (const lane of LANES) {
      const bkt = rows[lane.name];
      const aMs = median(bkt.aMs);
      const bMs = median(bkt.bMs);
      const aRps = median(bkt.a);
      const bRps = median(bkt.b);
      const delta = pct(aRps, bRps);
      const deltaNum = parseFloat(delta);
      const verdict =
        lane.group === "controls"
          ? "control lane"
          : Math.abs(deltaNum) <= Math.max(20, ctrlSpread)
            ? "lane-neutral"
            : deltaNum > 0
              ? "A faster"
              : "B faster";
      console.log(
        `║ ${lane.name.padEnd(25)} ${lane.group.padEnd(11)} ${aMs.toFixed(3).padStart(6)} ${aRps.toFixed(0).padStart(9)} ${bMs.toFixed(3).padStart(6)} ${bRps.toFixed(0).padStart(9)} ${String(delta + "%").padStart(10)}   ${verdict}`,
      );
    }
    console.log(
      "╚══════════════════════════════════════════════════════════════════════════════════════════╝\n",
    );

    // Teardown the probe table.
    try {
      const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
      await (db as any).execute(
        sql.raw(`DROP TABLE IF EXISTS ${q}collection_${COLLECTION_ID}${q}`),
      );
    } catch {}
  } finally {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  }
}, 900_000);
