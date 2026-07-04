/**
 * @file scripts/benchmark-matrix/generate-benchmark-reports.ts
 * @description Generates clean per-DB benchmark MDX shells (one LEDGER tag per test).
 *
 * Usage: bun run scripts/benchmark-matrix/generate-benchmark-reports.ts
 *        bun run scripts/benchmark-matrix/generate-benchmark-reports.ts --force-all
 *        bun run scripts/benchmark-matrix/generate-benchmark-reports.ts --force-sqlite
 */
import fs from "node:fs";
import path from "node:path";
import { buildReportShell } from "../../tests/benchmarks/modules/benchmark-mdx";
import { BENCHMARK_SCRIPTS } from "./benchmark-scripts";

interface DbConfig {
  key: string;
  title: string;
  order: number;
  adapterName: string;
  codePathPrefix: string;
}

const ALL_DBS: DbConfig[] = [
  {
    key: "sqlite",
    title: "SQLite Performance Audit",
    order: 5,
    adapterName: "SQLite",
    codePathPrefix: "sqlite",
  },
  {
    key: "sqlite_redis",
    title: "SQLite + Redis Performance Audit",
    order: 6,
    adapterName: "SQLite+Redis",
    codePathPrefix: "sqlite",
  },
  {
    key: "postgresql",
    title: "PostgreSQL Performance Audit",
    order: 7,
    adapterName: "PostgreSQL",
    codePathPrefix: "postgresql",
  },
  {
    key: "postgresql_redis",
    title: "PostgreSQL + Redis Performance Audit",
    order: 8,
    adapterName: "PostgreSQL+Redis",
    codePathPrefix: "postgresql",
  },
  {
    key: "mariadb",
    title: "MariaDB Performance Audit",
    order: 9,
    adapterName: "MariaDB",
    codePathPrefix: "mariadb",
  },
  {
    key: "mariadb_redis",
    title: "MariaDB + Redis Performance Audit",
    order: 10,
    adapterName: "MariaDB+Redis",
    codePathPrefix: "mariadb",
  },
  {
    key: "mongodb",
    title: "MongoDB Performance Audit",
    order: 11,
    adapterName: "MongoDB",
    codePathPrefix: "mongodb",
  },
  {
    key: "mongodb_redis",
    title: "MongoDB + Redis Performance Audit",
    order: 12,
    adapterName: "MongoDB+Redis",
    codePathPrefix: "mongodb",
  },
];

const scripts = BENCHMARK_SCRIPTS.map((s) => ({
  path: s.path,
  label: s.label,
  shortLabel: s.shortLabel,
  desc: s.desc,
  strategy: s.strategy,
  section: s.section,
}));

function generate() {
  const forceAll = process.argv.includes("--force-all");
  const forceSqlite = process.argv.includes("--force-sqlite") || forceAll;
  const outDir = path.resolve(process.cwd(), "docs/project/benchmarks");
  fs.mkdirSync(outDir, { recursive: true });

  for (const db of ALL_DBS) {
    if (db.key === "sqlite" && !forceSqlite) {
      console.log("⏭️  Skipped benchmark_sqlite.mdx (use --force-sqlite or --force-all)");
      continue;
    }

    const content = buildReportShell({
      dbKey: db.key,
      title: db.title,
      adapterName: db.adapterName,
      order: db.order,
      scripts,
      codePathPrefix: db.codePathPrefix,
    });

    const outPath = path.join(outDir, `benchmark_${db.key}.mdx`);
    fs.writeFileSync(outPath, content, "utf8");
    console.log(`✅ Generated: benchmark_${db.key}.mdx`);
  }

  console.log("\nDone! One LEDGER tag pair per applicable benchmark script.");
}

generate();
