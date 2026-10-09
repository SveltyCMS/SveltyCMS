/**
 * @file tests/benchmarks/probe-list-wire-ab.test.ts
 * @description Direct-to-Wire List Streaming A/B benchmark on PostgreSQL/SQLite.
 *
 * Compares:
 *   Arm A (Domain Plane):
 *     crud.findMany(50 rows) -> JS entity hydration -> JSON.stringify
 *   Arm B (Direct-to-Wire):
 *     Postgres/SQLite engine JSON aggregation (jsonb_agg / json_group_array)
 *     returning single wire_body text directly from the database engine.
 *
 * Alternates arms in pairs with control lanes to cancel host drift.
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
import { generateUUID } from "@utils/native-utils";
import { serializeSuccessEnvelope } from "@utils/fast-json";

const COLLECTION_ID = "wire_list_probe";
const TEST_TENANT = "global";
const SEED_ROWS = 500;
const PAIRS = 3;
const WARMUP = 20;
const ITERATIONS = 100;
const PAGE_SIZE = 50;

let stopServer: (() => Promise<void>) | null = null;

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
          { db_fieldName: "content", widget: { Name: "Textarea" } },
          { db_fieldName: "count", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch((err: unknown) => logger.debug(`createModel: ${String(err)}`));

    try {
      await db.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS ${q}idx_wire_status${q} ON ${q}${tableName}${q} (${q}status${q})`,
        ),
      );
      await db.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS ${q}idx_wire_tenant${q} ON ${q}${tableName}${q} (${q}tenantId${q})`,
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
        title: `Wire list test title ${n}`,
        status: n % 3 === 0 ? "draft" : "published",
        content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit number ${n}. `,
        count: n * 10,
        tenantId: TEST_TENANT,
      };
    });
    const res = await db.crud.insertMany(COLLECTION_ID, batch, { tenantId: TEST_TENANT });
    assertSuccess(res, "seed");
  }
  return ids;
}

test("Direct-to-Wire List Streaming A/B Benchmark", async () => {
  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    const dbType = getDbType();
    await prepareCollection(db);
    await seedRows(db);

    const tableName = `collection_${COLLECTION_ID}`;

    // Arm A: Domain Plane (Standard findMany + JSON.stringify)
    const runDomainArm = async () => {
      const res = await db.crud.findMany(
        COLLECTION_ID,
        { tenantId: TEST_TENANT, status: "published" } as any,
        {
          limit: PAGE_SIZE,
          offset: 0,
          tenantId: TEST_TENANT as any,
        },
      );
      if (!res.success || !res.data) throw new Error("Domain read failed: " + JSON.stringify(res));
      const body = serializeSuccessEnvelope(res.data);
      if (body.length < 100) throw new Error("Empty body");
    };

    // Arm B: Direct-to-Wire SQL
    let runWireArm: () => Promise<void>;

    if (dbType === "postgresql") {
      const wireSql = `
        SELECT jsonb_build_object(
          'success', true,
          'data', coalesce(jsonb_agg(doc), '[]'::jsonb)
        )::text AS wire_body
        FROM (
          SELECT (
            CASE WHEN "data" IS NULL
              THEN jsonb_build_object('_id', "_id", 'status', "status")
              ELSE ("data" || jsonb_build_object('_id', "_id", 'status', "status"))
            END
          ) AS doc
          FROM "${tableName}"
          WHERE "tenantId" = $1 AND "status" = 'published'
          ORDER BY "updatedAt" DESC, "_id" DESC
          LIMIT $2 OFFSET $3
        ) sub;
      `;
      runWireArm = async () => {
        const rows = await (db as any).sql.unsafe(wireSql, [TEST_TENANT, PAGE_SIZE, 0]);
        const wireBody = rows[0]?.wire_body;
        if (!wireBody || wireBody.length < 100) throw new Error("Wire read failed");
      };
    } else if (dbType === "mariadb" || dbType === "mysql") {
      const wireSql = `
        SELECT JSON_OBJECT(
          'success', true,
          'data', COALESCE(JSON_ARRAYAGG(doc), JSON_ARRAY())
        ) AS wire_body
        FROM (
          SELECT JSON_SET(
            COALESCE(\`data\`, '{}'),
            '$."_id"', \`_id\`,
            '$."status"', \`status\`
          ) AS doc
          FROM \`${tableName}\`
          WHERE \`tenantId\` = ? AND \`status\` = 'published'
          ORDER BY \`updatedAt\` DESC, \`_id\` DESC
          LIMIT ? OFFSET ?
        ) sub;
      `;
      runWireArm = async () => {
        const [rows] = await (db as any).pool.execute(wireSql, [TEST_TENANT, PAGE_SIZE, 0]);
        const wireBody = rows[0]?.wire_body;
        if (!wireBody || wireBody.length < 100) throw new Error("MariaDB wire read failed");
      };
    } else {
      // SQLite wire JSON
      const wireSql = `
        SELECT json_object(
          'success', json('true'),
          'data', coalesce(json_group_array(json(doc)), json('[]'))
        ) AS wire_body
        FROM (
          SELECT json_set(
            coalesce("data", '{}'),
            '$."_id"', "_id",
            '$."status"', "status"
          ) AS doc
          FROM "${tableName}"
          WHERE "tenantId" = ? AND "status" = 'published'
          ORDER BY "updatedAt" DESC, "_id" DESC
          LIMIT ? OFFSET ?
        );
      `;
      runWireArm = async () => {
        const row = (db as any).prepareAndExecute(wireSql, "get", TEST_TENANT, PAGE_SIZE, 0);
        const wireBody = row?.wire_body;
        if (!wireBody || wireBody.length < 100) throw new Error("SQLite wire read failed");
      };
    }

    const aRps: number[] = [];
    const bRps: number[] = [];
    const aMs: number[] = [];
    const bMs: number[] = [];

    console.log(`\nStarting Direct-to-Wire List A/B (${dbType}) with ${PAIRS} alternated pairs...`);

    for (let pair = 0; pair < PAIRS; pair++) {
      const order: Array<"A" | "B"> = pair % 2 === 0 ? ["A", "B"] : ["B", "A"];
      for (const arm of order) {
        const fn = arm === "A" ? runDomainArm : runWireArm;
        const res = await runBenchmark({
          name: `list-wire-ab [${arm}] pair ${pair}`,
          warmupIterations: WARMUP,
          iterations: ITERATIONS,
          concurrency: 1,
          silent: true,
          onIteration: fn,
        });

        if (arm === "A") {
          aRps.push(res.rps);
          aMs.push(res.avgMs);
        } else {
          bRps.push(res.rps);
          bMs.push(res.avgMs);
        }
      }
    }

    const median = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] || 0;
    };

    const medARps = median(aRps);
    const medBRps = median(bRps);
    const medAMs = median(aMs);
    const medBMs = median(bMs);

    const deltaRps = (((medBRps - medARps) / medARps) * 100).toFixed(1);
    const deltaMs = (((medBMs - medAMs) / medAMs) * 100).toFixed(1);

    console.log(
      "\n╔══════════════════════════════════════════════════════════════════════════════════════════╗",
    );
    console.log(
      `║  DIRECT-TO-WIRE LIST A/B (${dbType}) — Domain Plane (A) vs Direct-to-Wire (B)            ║`,
    );
    console.log(
      `║  seed=${SEED_ROWS} rows  limit=${PAGE_SIZE}  pairs=${PAIRS}  iters=${ITERATIONS}                                 ║`,
    );
    console.log(
      "╠══════════════════════════════════════════════════════════════════════════════════════════╣",
    );
    console.log(
      `║ Arm A (Domain findMany + stringify):   ${medAMs.toFixed(3)} ms  |  ${Math.round(medARps).toLocaleString()} RPS                     ║`,
    );
    console.log(
      `║ Arm B (Direct-to-Wire engine JSON):    ${medBMs.toFixed(3)} ms  |  ${Math.round(medBRps).toLocaleString()} RPS                     ║`,
    );
    console.log(
      `║ Delta (B vs A):                       ${deltaMs}% lat |  ${deltaRps}% RPS                     ║`,
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════════════════════════════════╝\n",
    );
  } finally {
    if (stopServer) await stopServer();
  }
}, 60000);
