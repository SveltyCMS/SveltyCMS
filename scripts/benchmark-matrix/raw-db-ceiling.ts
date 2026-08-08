/**
 * @file scripts/benchmark-matrix/raw-db-ceiling.ts
 * @description
 * Raw database engine ceiling probe — measures the maximum RPS each database
 * engine can physically sustain on this machine using ONLY the native driver,
 * bypassing the entire CMS stack (adapter, cache, auth, HTTP).
 *
 * The purpose is to stop guessing how much headroom remains: the ratio
 * `CMS HTTP RPS ÷ raw engine RPS` is the total middleware + adapter tax.
 *
 * ### Scale comparison (1 vs 100,000 rows)
 * A 1-row table lives in the root page / L1 cache; a 100k-row table has real
 * index depth, page misses, and ORDER BY temp B-tree costs. Every op runs at
 * both scales so latency growth is visible, not guessed.
 *
 * ### Single-entry ops (mirror the concurrent board):
 * - findById   — PK lookup, pseudo-random id (real page distribution)
 * - findMissing — PK lookup returning nothing (negative-cache comparator)
 * - insert     — single-row create with a ~300 B JSON payload
 * - update     — PK update (data + updatedAt), random row
 *
 * ### Many-entry ops:
 * - listPlain  — tenant+status filter, LIMIT 50, ORDER BY updatedAt DESC
 * - findMany50 — tenant+status filter, LIMIT 50, no sort (index-only shape)
 * - insertMany — one multi-row batch of 100 (single round trip)
 *
 * ### Concurrency: 1 and 8 workers (8c matches the api-latency board).
 *
 * ### Engines: sqlite (bun:sqlite / node:sqlite), postgresql (postgres.js),
 * mariadb (mysql2), mongodb (mongodb driver).
 *
 * ### Usage:
 *   bun run scripts/benchmark-matrix/raw-db-ceiling.ts --db=sqlite
 *   bun run scripts/benchmark-matrix/raw-db-ceiling.ts --db=sqlite,postgresql,mariadb,mongodb
 *   bun run scripts/benchmark-matrix/raw-db-ceiling.ts --db=postgresql --scale=10000,1000000
 *
 * ### Features:
 * - fixed-duration measurement (warmup 800 ms, measure 2500 ms per op/concurrency)
 * - prepared statements reused in the hot loop (matches adapter behavior)
 * - deterministic LCG pseudo-random row access (no Math.random)
 * - dedicated benchmark database per engine (never touches CMS data)
 * - per-scale truth table with avg latency + degradation ratio
 */

import { performance } from "node:perf_hooks";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// MongoDB driver needs the V8 startupSnapshot stub under Bun (bson calls it at load).
import "@utils/v8-shim";

// ──────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────

const WARMUP_MS = 800;
const MEASURE_MS = 2500;
const TENANT = "global";
const STATUS = "active";
const BATCH_SIZE = 100; // insertMany batch

/** Realistic entry payload (~300 B JSON) — mirrors typical CMS entries. */
const PAYLOAD = JSON.stringify({
  title: "Raw ceiling entry",
  slug: "raw-ceiling-entry",
  excerpt: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  body: "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  tags: ["bench", "raw"],
  meta: { seo: "raw-ceiling", published: true, author: "probe" },
});

/** CMS HTTP board from the last concurrent 8c run (api-latency / concurrency suites). */
const CMS_BOARD: Record<string, number> = {
  findById: 557, // uncached (findByIdRandom) — cached L1 turbo is 1571 (not DB-bound)
  findMissing: 2163, // L1 negative-cache hit — NOT raw-DB-bound (see note)
  create: 421,
  update: 240,
  listPlain: 684, // listLarge (uncached); cached listPlain is 1521 (not DB-bound)
};

/** Default row-count scales (nearly-empty vs full); override with --scale=1,100000 */
const SCALES = (() => {
  const arg = process.argv.find((a) => a.startsWith("--scale="))?.split("=")[1];
  if (arg)
    return arg
      .split(",")
      .map(Number)
      .filter((n) => n > 0);
  return [1, 100_000];
})();

// ──────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (LCG) — pseudo-random row access without Math.random
// ──────────────────────────────────────────────────────────────────────────

const rngState = Array.from({ length: 64 }, () => 42);
function nextRand(w: number): number {
  rngState[w] = (rngState[w] * 1664525 + 1013904223) >>> 0;
  return rngState[w] / 2 ** 32;
}

/** Per-worker monotonic counters for unique insert/miss ids across iterations. */
const wCounters = Array.from({ length: 64 }, () => 0);
const counter = (w: number) => {
  wCounters[w]++;
  return wCounters[w];
};

// ──────────────────────────────────────────────────────────────────────────
// Measurement harness (fixed-duration, worker-count agnostic)
// ──────────────────────────────────────────────────────────────────────────

interface OpSample {
  op: string;
  concurrency: number;
  rps: number;
  ops: number;
  avgMs: number;
}

async function runFixedDuration(
  workerCount: number,
  op: (workerId: number) => void | Promise<void>,
): Promise<{ ops: number; durationMs: number }> {
  const invoke = async (w: number) => {
    const r = op(w);
    if (r && typeof (r as any).then === "function") await r;
  };

  // Warmup phase (results discarded)
  const warmupEnd = performance.now() + WARMUP_MS;
  await Promise.all(
    Array.from({ length: workerCount }, async (_, w) => {
      while (performance.now() < warmupEnd) await invoke(w);
    }),
  );

  // Measure phase
  const start = performance.now();
  const deadline = start + MEASURE_MS;
  const counts = Array.from({ length: workerCount }, () => 0);

  await Promise.all(
    Array.from({ length: workerCount }, async (_, w) => {
      while (performance.now() < deadline) {
        await invoke(w);
        counts[w]++;
      }
    }),
  );

  const durationMs = performance.now() - start;
  const ops = counts.reduce((a, b) => a + b, 0);
  return { ops, durationMs };
}

async function benchOp(
  label: string,
  workerCounts: number[],
  op: (workerId: number) => void | Promise<void>,
): Promise<OpSample[]> {
  const samples: OpSample[] = [];
  for (const c of workerCounts) {
    const { ops, durationMs } = await runFixedDuration(c, op);
    samples.push({
      op: label,
      concurrency: c,
      rps: Math.round((ops / durationMs) * 1000),
      ops,
      avgMs: durationMs / ops,
    });
  }
  return samples;
}

// ──────────────────────────────────────────────────────────────────────────
// Engine interface — setup takes the row-count scale
// ──────────────────────────────────────────────────────────────────────────

interface Engine {
  name: string;
  setup(seedRows: number): Promise<void>;
  bench(): Promise<OpSample[]>;
  teardown(): Promise<void>;
}

const CONCURRENCIES = [1, 8];

// ──────────────────────────────────────────────────────────────────────────
// SQLite (bun:sqlite with node:sqlite fallback) — mirrors adapter pragmas
// ──────────────────────────────────────────────────────────────────────────

class SqliteEngine implements Engine {
  name = "sqlite";
  private dbPath = path.join(os.tmpdir(), `raw-ceiling-${process.pid}.sqlite`);
  private conns: any[] = [];
  private seedRows = 0;
  private stmts: {
    find: any[];
    miss: any[];
    insert: any;
    insertMany: any;
    update: any;
    deleteStmt: any;
    list: any[];
    listNoSort: any[];
  } = {
    find: [],
    miss: [],
    insert: null,
    insertMany: null,
    update: null,
    deleteStmt: null,
    list: [],
    listNoSort: [],
  };

  private async reseed(): Promise<void> {
    const main = this.conns[this.conns.length - 1];
    main.exec("DELETE FROM content_bench");
    main.exec("BEGIN");
    const ins = main.prepare(
      `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    );
    const now = Date.now();
    for (let i = 0; i < this.seedRows; i++) {
      ins.run(`seed-${i}`, TENANT, PAYLOAD, STATUS, now, now);
    }
    main.exec("COMMIT");
    ins.finalize();
  }

  async setup(seedRows: number): Promise<void> {
    this.seedRows = seedRows;
    // First setup: create schema on a fresh temp file.
    if (this.conns.length === 0) {
      if (fs.existsSync(this.dbPath)) fs.unlinkSync(this.dbPath);
      const { Database } =
        typeof Bun !== "undefined"
          ? ((await import("bun:sqlite")) as any)
          : ((await import("node:sqlite")) as any);

      const mk = () => {
        const db = new Database(this.dbPath);
        db.exec("PRAGMA journal_mode=WAL");
        db.exec("PRAGMA synchronous=NORMAL");
        db.exec("PRAGMA foreign_keys=ON");
        db.exec("PRAGMA page_size=8192");
        db.exec("PRAGMA busy_timeout=30000");
        db.exec("PRAGMA temp_store=MEMORY");
        db.exec("PRAGMA mmap_size=536870912");
        db.exec("PRAGMA cache_size=-20000");
        return db;
      };

      const main = mk();
      main.exec(`CREATE TABLE IF NOT EXISTS content_bench (
        _id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        isDeleted INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`);
      main.exec(
        `CREATE INDEX IF NOT EXISTS idx_content_bench_tenant_status ON content_bench (tenantId, status)`,
      );
      main.exec(
        `CREATE INDEX IF NOT EXISTS idx_content_bench_updated ON content_bench (updatedAt DESC)`,
      );

      // One connection per read worker + one write connection
      for (let w = 0; w < 9; w++) this.conns.push(mk());
      const readConns = this.conns.slice(1);
      this.stmts.find = readConns.map((c) =>
        c.prepare(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE _id = ? AND tenantId = ?`,
        ),
      );
      this.stmts.miss = this.stmts.find;
      this.stmts.list = readConns.map((c) =>
        c.prepare(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE tenantId = ? AND status = ? AND isDeleted = 0
           ORDER BY updatedAt DESC LIMIT 50`,
        ),
      );
      this.stmts.listNoSort = readConns.map((c) =>
        c.prepare(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE tenantId = ? AND status = ? AND isDeleted = 0
           LIMIT 50`,
        ),
      );
      this.stmts.insert = this.conns[0].prepare(
        `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      );
      this.stmts.insertMany = this.conns[0].prepare(
        `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt)
         VALUES ${Array(BATCH_SIZE).fill("(?, ?, ?, ?, 0, ?, ?)").join(",")}`,
      );
      this.stmts.update = this.conns[0].prepare(
        `UPDATE content_bench SET data = ?, updatedAt = ? WHERE _id = ? AND tenantId = ?`,
      );
      this.stmts.deleteStmt = this.conns[0].prepare(
        `DELETE FROM content_bench WHERE _id = ? AND tenantId = ?`,
      );
      // Keep main open until teardown (owns WAL)
      this.conns.push(main);
    }

    // (Re)seed: clear rows, keep schema + prepared statements stable across scales.
    const main = this.conns[this.conns.length - 1];
    main.exec("DELETE FROM content_bench");
    await this.reseed();
  }

  async bench(): Promise<OpSample[]> {
    const samples: OpSample[] = [];
    const now = Date.now();
    const N = this.seedRows;

    // ── Single-entry reads ──
    samples.push(
      ...(await benchOp("findById", CONCURRENCIES, (w) => {
        this.stmts.find[w % 8].get(`seed-${Math.floor(nextRand(w) * N)}`, TENANT);
      })),
    );

    samples.push(
      ...(await benchOp("findMissing", CONCURRENCIES, (w) => {
        this.stmts.miss[w % 8].get(`missing-${w}-${counter(w)}`, TENANT);
      })),
    );

    // ── Many-entry reads ──
    samples.push(
      ...(await benchOp("listPlain", CONCURRENCIES, (w) => {
        this.stmts.list[w % 8].all(TENANT, STATUS);
      })),
    );

    samples.push(
      ...(await benchOp("findMany50", CONCURRENCIES, (w) => {
        this.stmts.listNoSort[w % 8].all(TENANT, STATUS);
      })),
    );

    // ── Single-entry writes (reseed before each so scale stays exact) ──
    const singleWrites: Array<[string, (w: number) => void]> = [
      [
        "insert",
        (w: number) => {
          this.stmts.insert.run(`new-${w}-${counter(w)}`, TENANT, PAYLOAD, STATUS, now, now);
        },
      ],
      [
        "update",
        (w: number) => {
          this.stmts.update.run(PAYLOAD, now, `seed-${Math.floor(nextRand(w) * N)}`, TENANT);
        },
      ],
      [
        "delete",
        (w: number) => {
          this.stmts.deleteStmt.run(`seed-${Math.floor(nextRand(w) * N)}`, TENANT);
        },
      ],
    ];
    for (const [label, op] of singleWrites) {
      await this.reseed();
      samples.push(...(await benchOp(label, CONCURRENCIES, op)));
    }

    // ── Many-entry write (single multi-row statement) ──
    await this.reseed();
    samples.push(
      ...(await benchOp("insertMany100", CONCURRENCIES, (w) => {
        const base = counter(w) * BATCH_SIZE;
        const args: any[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
          args.push(`bulk-${w}-${base + i}`, TENANT, PAYLOAD, STATUS, now, now);
        }
        this.stmts.insertMany.run(...args);
      })),
    );

    return samples;
  }

  async teardown(): Promise<void> {
    for (const conn of this.conns) {
      try {
        conn.close();
      } catch {
        /* already closed */
      }
    }
    try {
      fs.unlinkSync(this.dbPath);
      fs.unlinkSync(this.dbPath + "-wal");
      fs.unlinkSync(this.dbPath + "-shm");
    } catch {
      /* best effort */
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PostgreSQL (postgres.js)
// ──────────────────────────────────────────────────────────────────────────

class PostgresEngine implements Engine {
  name = "postgresql";
  private sql: any;
  private seedRows = 0;
  private findStmt: any;
  private missStmt: any;
  private listStmt: any;
  private listNoSortStmt: any;
  private insertStmt: any;
  private insertManyStmt: any;
  private updateStmt: any;
  private deleteStmt: any;
  private now = Date.now();

  private async reseed(): Promise<void> {
    await this.sql`TRUNCATE content_bench`;
    const CHUNK = 500; // 500 rows × 7 params = 3500 < 65535
    for (let start = 0; start < this.seedRows; start += CHUNK) {
      const rows = Array.from({ length: Math.min(CHUNK, this.seedRows - start) }, (_, i) => [
        `seed-${start + i}`,
        TENANT,
        PAYLOAD,
        STATUS,
        0,
        this.now,
        this.now,
      ]);
      const valuesSql = rows
        .map(
          (_, i) =>
            `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`,
        )
        .join(",");
      await this.sql.unsafe(
        `INSERT INTO content_bench (_id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt") VALUES ${valuesSql}`,
        rows.flat(),
      );
    }
  }

  async setup(seedRows: number): Promise<void> {
    this.seedRows = seedRows;
    this.now = Date.now();
    const postgres = (await import("postgres")).default;
    if (!this.sql) {
      // Ensure benchmark database exists
      const admin = postgres("postgres://postgres:postgres@127.0.0.1:5432/postgres", {
        max: 1,
        connect_timeout: 5,
      });
      const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'sveltycms_bench'`;
      if (exists.length === 0) {
        await admin`CREATE DATABASE sveltycms_bench`;
      }
      await admin.end();

      this.sql = postgres("postgres://postgres:postgres@127.0.0.1:5432/sveltycms_bench", {
        max: 10,
        connect_timeout: 5,
        prepare: true,
      });
    }

    await this.sql`CREATE TABLE IF NOT EXISTS content_bench (
      _id TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      "isDeleted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" BIGINT NOT NULL,
      "updatedAt" BIGINT NOT NULL
    )`;
    await this
      .sql`CREATE INDEX IF NOT EXISTS idx_tenant_status ON content_bench ("tenantId", status)`;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_updated ON content_bench ("updatedAt" DESC)`;
    await this.reseed();

    this.findStmt = (id: string, tenant: string) =>
      this.sql`SELECT _id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt"
      FROM content_bench WHERE _id = ${id} AND "tenantId" = ${tenant}`;
    this.missStmt = this.findStmt;
    this.listStmt = (tenant: string, status: string) =>
      this.sql`SELECT _id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt"
      FROM content_bench WHERE "tenantId" = ${tenant} AND status = ${status} AND "isDeleted" = 0
      ORDER BY "updatedAt" DESC LIMIT 50`;
    this.listNoSortStmt = (tenant: string, status: string) =>
      this.sql`SELECT _id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt"
      FROM content_bench WHERE "tenantId" = ${tenant} AND status = ${status} AND "isDeleted" = 0
      LIMIT 50`;
    this.insertStmt = (id: string, tenant: string, data: string, status: string) =>
      this
        .sql`INSERT INTO content_bench (_id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt")
      VALUES (${id}, ${tenant}, ${data}, ${status}, 0, ${this.now}, ${this.now})`;
    this.insertManyStmt = (id: string, tenant: string, data: string, status: string) =>
      this.sql.unsafe(
        `INSERT INTO content_bench (_id, "tenantId", data, status, "isDeleted", "createdAt", "updatedAt")
         VALUES ${Array.from(
           { length: BATCH_SIZE },
           (_, i) =>
             `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`,
         ).join(",")}`,
        Array.from({ length: BATCH_SIZE }, (_, i) => [
          `${id}-${i}`,
          tenant,
          data,
          status,
          0,
          this.now,
          this.now,
        ]).flat(),
      );
    this.updateStmt = (data: string, updatedAt: number, id: string, tenant: string) =>
      this.sql`UPDATE content_bench SET data = ${data}, "updatedAt" = ${updatedAt}
      WHERE _id = ${id} AND "tenantId" = ${tenant}`;
    this.deleteStmt = (id: string, tenant: string) =>
      this.sql`DELETE FROM content_bench WHERE _id = ${id} AND "tenantId" = ${tenant}`;
  }

  async bench(): Promise<OpSample[]> {
    const samples: OpSample[] = [];
    const N = this.seedRows;

    samples.push(
      ...(await benchOp("findById", CONCURRENCIES, (w) =>
        this.findStmt(`seed-${Math.floor(nextRand(w) * N)}`, TENANT),
      )),
    );

    samples.push(
      ...(await benchOp("findMissing", CONCURRENCIES, (w) =>
        this.missStmt(`missing-${w}-${counter(w)}`, TENANT),
      )),
    );

    samples.push(
      ...(await benchOp("listPlain", CONCURRENCIES, () => this.listStmt(TENANT, STATUS))),
    );

    samples.push(
      ...(await benchOp("findMany50", CONCURRENCIES, () => this.listNoSortStmt(TENANT, STATUS))),
    );

    // ── Single-entry writes (reseed before each so scale stays exact) ──
    const singleWrites: Array<[string, (w: number) => Promise<void>]> = [
      [
        "insert",
        async (w: number) => {
          await this.insertStmt(`new-${w}-${counter(w)}`, TENANT, PAYLOAD, STATUS);
        },
      ],
      [
        "update",
        async (w: number) => {
          await this.updateStmt(PAYLOAD, this.now, `seed-${Math.floor(nextRand(w) * N)}`, TENANT);
        },
      ],
      [
        "delete",
        async (w: number) => {
          await this.deleteStmt(`seed-${Math.floor(nextRand(w) * N)}`, TENANT);
        },
      ],
    ];
    for (const [label, op] of singleWrites) {
      await this.reseed();
      samples.push(...(await benchOp(label, CONCURRENCIES, op)));
    }

    // ── Many-entry write (single multi-row statement) ──
    await this.reseed();
    samples.push(
      ...(await benchOp("insertMany100", CONCURRENCIES, async (w) => {
        await this.insertManyStmt(`bulk-${w}-${counter(w) * BATCH_SIZE}`, TENANT, PAYLOAD, STATUS);
      })),
    );

    return samples;
  }

  async teardown(): Promise<void> {
    if (this.sql) await this.sql.end({ timeout: 2 }).catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MariaDB (mysql2/promise — prepared statements via execute)
// ──────────────────────────────────────────────────────────────────────────

class MariaDbEngine implements Engine {
  name = "mariadb";
  private pool: any;
  private seedRows = 0;
  private find: any;
  private list: any;
  private listNoSort: any;
  private insert: any;
  private insertMany: any;
  private update: any;
  private deleteStmt: any;
  private now = Date.now();

  private async reseed(): Promise<void> {
    await this.pool.query(`TRUNCATE TABLE content_bench`);
    const CHUNK = 500;
    for (let start = 0; start < this.seedRows; start += CHUNK) {
      const n = Math.min(CHUNK, this.seedRows - start);
      const placeholders = Array(n).fill("(?, ?, ?, ?, 0, ?, ?)").join(",");
      const values: any[] = [];
      for (let i = 0; i < n; i++) {
        values.push(`seed-${start + i}`, TENANT, PAYLOAD, STATUS, this.now, this.now);
      }
      await this.pool.query(
        `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt) VALUES ${placeholders}`,
        values,
      );
    }
  }

  async setup(seedRows: number): Promise<void> {
    this.seedRows = seedRows;
    this.now = Date.now();
    const mysql = (await import("mysql2/promise")) as any;
    if (!this.pool) {
      const admin = await mysql.createConnection({
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: "mariadb",
        connectTimeout: 5000,
      });
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS sveltycms_bench CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
      await admin.end();

      this.pool = mysql.createPool({
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: "mariadb",
        database: "sveltycms_bench",
        connectionLimit: 10,
        namedPlaceholders: true,
      });
    }

    await this.pool.query(`CREATE TABLE IF NOT EXISTS content_bench (
      _id VARCHAR(64) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      data LONGTEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      isDeleted TINYINT NOT NULL DEFAULT 0,
      createdAt BIGINT NOT NULL,
      updatedAt BIGINT NOT NULL
    )`);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_status ON content_bench (tenantId, status)`,
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_updated ON content_bench (updatedAt)`);
    await this.reseed();

    // mysql2 pool has no .prepare() — execute() uses server-side prepared statements
    this.find = {
      execute: (args: any[]) =>
        this.pool.execute(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE _id = ? AND tenantId = ?`,
          args,
        ),
    };
    this.list = {
      execute: (args: any[]) =>
        this.pool.execute(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE tenantId = ? AND status = ? AND isDeleted = 0
           ORDER BY updatedAt DESC LIMIT 50`,
          args,
        ),
    };
    this.listNoSort = {
      execute: (args: any[]) =>
        this.pool.execute(
          `SELECT _id, tenantId, data, status, isDeleted, createdAt, updatedAt
           FROM content_bench WHERE tenantId = ? AND status = ? AND isDeleted = 0
           LIMIT 50`,
          args,
        ),
    };
    this.insert = {
      execute: (args: any[]) =>
        this.pool.execute(
          `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          args,
        ),
    };
    this.insertMany = {
      execute: (args: any[]) =>
        this.pool.execute(
          `INSERT INTO content_bench (_id, tenantId, data, status, isDeleted, createdAt, updatedAt)
           VALUES ${Array(BATCH_SIZE).fill("(?, ?, ?, ?, 0, ?, ?)").join(",")}`,
          args,
        ),
    };
    this.update = {
      execute: (args: any[]) =>
        this.pool.execute(
          `UPDATE content_bench SET data = ?, updatedAt = ? WHERE _id = ? AND tenantId = ?`,
          args,
        ),
    };
    this.deleteStmt = {
      execute: (args: any[]) =>
        this.pool.execute(`DELETE FROM content_bench WHERE _id = ? AND tenantId = ?`, args),
    };
  }

  async bench(): Promise<OpSample[]> {
    const samples: OpSample[] = [];
    const N = this.seedRows;

    samples.push(
      ...(await benchOp("findById", CONCURRENCIES, async (w) => {
        const [rows] = await this.find.execute([`seed-${Math.floor(nextRand(w) * N)}`, TENANT]);
        return rows;
      })),
    );

    samples.push(
      ...(await benchOp("findMissing", CONCURRENCIES, async (w) => {
        const [rows] = await this.find.execute([`missing-${w}-${counter(w)}`, TENANT]);
        return rows;
      })),
    );

    samples.push(
      ...(await benchOp("listPlain", CONCURRENCIES, async () => {
        const [rows] = await this.list.execute([TENANT, STATUS]);
        return rows;
      })),
    );

    samples.push(
      ...(await benchOp("findMany50", CONCURRENCIES, async () => {
        const [rows] = await this.listNoSort.execute([TENANT, STATUS]);
        return rows;
      })),
    );

    // ── Single-entry writes (reseed before each so scale stays exact) ──
    const singleWrites: Array<[string, (w: number) => Promise<void>]> = [
      [
        "insert",
        async (w: number) => {
          await this.insert.execute([
            `new-${w}-${counter(w)}`,
            TENANT,
            PAYLOAD,
            STATUS,
            this.now,
            this.now,
          ]);
        },
      ],
      [
        "update",
        async (w: number) => {
          await this.update.execute([
            PAYLOAD,
            this.now,
            `seed-${Math.floor(nextRand(w) * N)}`,
            TENANT,
          ]);
        },
      ],
      [
        "delete",
        async (w: number) => {
          await this.deleteStmt.execute([`seed-${Math.floor(nextRand(w) * N)}`, TENANT]);
        },
      ],
    ];
    for (const [label, op] of singleWrites) {
      await this.reseed();
      samples.push(...(await benchOp(label, CONCURRENCIES, op)));
    }

    // ── Many-entry write (single multi-row statement) ──
    await this.reseed();
    samples.push(
      ...(await benchOp("insertMany100", CONCURRENCIES, async (w) => {
        const base = counter(w) * BATCH_SIZE;
        const args: any[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
          args.push(`bulk-${w}-${base + i}`, TENANT, PAYLOAD, STATUS, this.now, this.now);
        }
        await this.insertMany.execute(args);
      })),
    );

    return samples;
  }

  async teardown(): Promise<void> {
    if (this.pool) await this.pool.end().catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MongoDB (mongodb driver)
// ──────────────────────────────────────────────────────────────────────────

class MongoEngine implements Engine {
  name = "mongodb";
  private client: any;
  private col: any;
  private seedRows = 0;
  private now = Date.now();

  private async reseed(): Promise<void> {
    await this.col.deleteMany({}).catch(() => {});
    const CHUNK = 10_000;
    for (let start = 0; start < this.seedRows; start += CHUNK) {
      const docs = Array.from({ length: Math.min(CHUNK, this.seedRows - start) }, (_, i) => ({
        _id: `seed-${start + i}`,
        tenantId: TENANT,
        data: PAYLOAD,
        status: STATUS,
        isDeleted: 0,
        createdAt: this.now,
        updatedAt: this.now,
      }));
      await this.col.insertMany(docs, { ordered: false });
    }
  }

  async setup(seedRows: number): Promise<void> {
    this.seedRows = seedRows;
    this.now = Date.now();
    const { MongoClient } = await import("mongodb");
    if (!this.client) {
      this.client = new MongoClient("mongodb://127.0.0.1:27017", {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      await this.client.connect();
      const db = this.client.db("sveltycms_bench");
      await db.dropCollection("content_bench").catch(() => {});
      this.col = db.collection("content_bench");
      await this.col.createIndex({ tenantId: 1, status: 1 });
      await this.col.createIndex({ updatedAt: -1 });
    } else {
      await this.col.drop().catch(() => {});
      this.col = this.client.db("sveltycms_bench").collection("content_bench");
      await this.col.createIndex({ tenantId: 1, status: 1 });
      await this.col.createIndex({ updatedAt: -1 });
    }

    // Seed in insertMany chunks
    await this.reseed();
  }

  async bench(): Promise<OpSample[]> {
    const samples: OpSample[] = [];
    const N = this.seedRows;
    const projection = {
      _id: 1,
      tenantId: 1,
      data: 1,
      status: 1,
      isDeleted: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    samples.push(
      ...(await benchOp("findById", CONCURRENCIES, (w) =>
        this.col.findOne(
          { _id: `seed-${Math.floor(nextRand(w) * N)}`, tenantId: TENANT },
          { projection },
        ),
      )),
    );

    samples.push(
      ...(await benchOp("findMissing", CONCURRENCIES, (w) =>
        this.col.findOne({ _id: `missing-${w}-${counter(w)}`, tenantId: TENANT }, { projection }),
      )),
    );

    samples.push(
      ...(await benchOp("listPlain", CONCURRENCIES, () =>
        this.col
          .find({ tenantId: TENANT, status: STATUS, isDeleted: 0 })
          .sort({ updatedAt: -1 })
          .limit(50)
          .toArray(),
      )),
    );

    samples.push(
      ...(await benchOp("findMany50", CONCURRENCIES, () =>
        this.col.find({ tenantId: TENANT, status: STATUS, isDeleted: 0 }).limit(50).toArray(),
      )),
    );

    // ── Single-entry writes (reseed before each so scale stays exact) ──
    const singleWrites: Array<[string, (w: number) => Promise<void>]> = [
      [
        "insert",
        async (w: number) => {
          await this.col.insertOne({
            _id: `new-${w}-${counter(w)}`,
            tenantId: TENANT,
            data: PAYLOAD,
            status: STATUS,
            isDeleted: 0,
            createdAt: this.now,
            updatedAt: this.now,
          });
        },
      ],
      [
        "update",
        async (w: number) => {
          await this.col.updateOne(
            { _id: `seed-${Math.floor(nextRand(w) * N)}`, tenantId: TENANT },
            { $set: { data: PAYLOAD, updatedAt: this.now } },
          );
        },
      ],
      [
        "delete",
        async (w: number) => {
          await this.col.deleteOne({
            _id: `seed-${Math.floor(nextRand(w) * N)}`,
            tenantId: TENANT,
          });
        },
      ],
    ];
    for (const [label, op] of singleWrites) {
      await this.reseed();
      samples.push(...(await benchOp(label, CONCURRENCIES, op)));
    }

    // ── Many-entry write (single bulkWrite) ──
    await this.reseed();
    samples.push(
      ...(await benchOp("insertMany100", CONCURRENCIES, (w) => {
        const base = counter(w) * BATCH_SIZE;
        const docs = Array.from({ length: BATCH_SIZE }, (_, i) => ({
          _id: `bulk-${w}-${base + i}`,
          tenantId: TENANT,
          data: PAYLOAD,
          status: STATUS,
          isDeleted: 0,
          createdAt: this.now,
          updatedAt: this.now,
        }));
        return this.col.insertMany(docs, { ordered: false });
      })),
    );

    return samples;
  }

  async teardown(): Promise<void> {
    if (this.client) await this.client.close().catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Reporting — dual-scale truth table
// ──────────────────────────────────────────────────────────────────────────

const OP_LABELS: Record<string, string> = {
  findById: "findById",
  findMissing: "findMissing",
  listPlain: "listPlain (sort)",
  findMany50: "findMany (50)",
  insert: "insert (1)",
  update: "update (1)",
  delete: "delete (1)",
  insertMany100: "insertMany (100)",
};

function fmtMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  return `${ms.toFixed(2)}ms`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function printTable(engine: string, scaleResults: Map<number, OpSample[]>) {
  const scales = [...scaleResults.keys()].sort((a, b) => a - b);
  const s1 = scales[0];
  const s2 = scales[1] ?? scales[0];
  const get = (scale: number, op: string, c: number) =>
    scaleResults.get(scale)?.find((x) => x.op === op && x.concurrency === c);

  console.log(
    `\n┌── ${engine.toUpperCase()} — RAW ENGINE CEILING (${fmtNum(s1)} vs ${fmtNum(s2)} rows)`,
  );
  console.log(
    `│ op                  conc  RPS@${fmtNum(s1).padEnd(5)} lat@${fmtNum(s1).padEnd(6)}  RPS@${fmtNum(s2).padEnd(5)} lat@${fmtNum(s2).padEnd(6)}  ΔRPS   vs CMS`,
  );
  console.log(`├────────────────────────────────────────────────────────────────────────────────`);

  for (const op of Object.keys(OP_LABELS)) {
    for (const c of CONCURRENCIES) {
      const a = get(s1, op, c);
      const b = get(s2, op, c);
      if (!a || !b) continue;
      const delta = a.rps > 0 ? b.rps / a.rps : 0;
      const cms = c === 8 ? CMS_BOARD[op] : undefined;
      const cmsStr = cms
        ? `${String(cms).padStart(4)} RPS (${Math.round((cms / b.rps) * 100)}% of ceil)`
        : "—";
      console.log(
        `│ ${OP_LABELS[op].padEnd(21)}  ${String(c).padStart(3)}  ${fmtNum(a.rps).padStart(6)}  ${fmtMs(a.avgMs).padStart(8)}  ${fmtNum(b.rps).padStart(6)}  ${fmtMs(b.avgMs).padStart(8)}  ${(delta >= 1 ? "+" : "") + delta.toFixed(2)}×  ${cmsStr}`,
      );
    }
  }
  console.log(`└────────────────────────────────────────────────────────────────────────────────`);
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const filter = process.argv
    .find((a) => a.startsWith("--db="))
    ?.split("=")[1]
    .toLowerCase()
    .split(",") || ["sqlite", "postgresql", "mariadb", "mongodb"];

  const engines: Engine[] = [];
  if (filter.includes("sqlite")) engines.push(new SqliteEngine());
  if (filter.includes("postgresql") || filter.includes("postgres"))
    engines.push(new PostgresEngine());
  if (filter.includes("mariadb") || filter.includes("mysql")) engines.push(new MariaDbEngine());
  if (filter.includes("mongodb") || filter.includes("mongo")) engines.push(new MongoEngine());

  if (engines.length === 0) {
    console.error("No engines matched. Use --db=sqlite,postgresql,mariadb,mongodb");
    process.exit(1);
  }

  console.log(`\n🚀 RAW DB CEILING PROBE — ${engines.map((e) => e.name.toUpperCase()).join(", ")}`);
  console.log(
    `   Ops: findById / findMissing / listPlain / findMany50 / insert / update / delete / insertMany100 @ ${CONCURRENCIES.join("+")}c`,
  );
  console.log(
    `   Scales: ${SCALES.map((s) => s.toLocaleString()).join(" rows, ")} rows · warmup ${WARMUP_MS}ms + measure ${MEASURE_MS}ms per op · payload ${PAYLOAD.length} B`,
  );
  console.log(`   Machine: ${os.cpus().length} cores ${os.cpus()[0]?.model || ""}`);

  for (let e = 0; e < engines.length; e++) {
    const engine = engines[e];
    if (!engine) continue;
    try {
      const scaleResults = new Map<number, OpSample[]>();
      for (let i = 0; i < SCALES.length; i++) {
        const scale = SCALES[i];
        console.log(`\n── ${engine.name}: seeding ${scale.toLocaleString()} rows...`);
        const t0 = performance.now();
        await engine.setup(scale);
        console.log(`   seeded in ${(performance.now() - t0).toFixed(0)}ms`);
        const samples = await engine.bench();
        scaleResults.set(scale, samples);
      }
      printTable(engine.name, scaleResults);
    } catch (err: any) {
      console.error(`\n❌ ${engine.name} FAILED: ${err?.message || err}`);
      if (process.env.RAW_CEILING_DEBUG === "true") console.error(err?.stack);
    } finally {
      await engine.teardown().catch(() => {});
    }
  }

  console.log(
    `\n✅ Done. ΔRPS = 100k RPS ÷ 1k RPS (1.0 = latency-neutral; <1 = degrades at scale).`,
  );
  console.log(
    `   CMS column uses uncached numbers (findByIdRandom=557, create=421, update=240, listLarge=684).`,
  );
  console.log(
    `   Cached CMS paths (findById L1 turbo=1571, listPlain=1521, findMissing=2163) are not DB-bound.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
