/**
 * @file scripts/benchmark-matrix/generate-benchmark-reports.ts
 * @description Generates all 8 database-specific benchmark MDX reports from the SQLite template.
 *
 * Usage: bun run scripts/benchmark-matrix/generate-benchmark-reports.ts
 */
import fs from "node:fs";
import path from "node:path";

const TEMPLATE = path.resolve(process.cwd(), "docs/project/benchmarks/benchmark_sqlite.mdx");

interface DbConfig {
  key: string;
  title: string;
  order: number;
  adapterName: string;
  codePathPrefix: string;
}

const DBS: DbConfig[] = [
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

function generate() {
  const template = fs.readFileSync(TEMPLATE, "utf8");

  for (const db of DBS) {
    // 🚀 Never regenerate from template — individual test runs populate it
    if (db.key === "sqlite") continue;

    let content = template;

    // Replace database-specific identifiers
    content = content.replace(
      /path: docs\/project\/benchmarks\/benchmark_sqlite\.mdx/g,
      `path: docs/project/benchmarks/benchmark_${db.key}.mdx`,
    );
    content = content.replace(/title: SQLite Performance Audit/g, `title: ${db.title}`);
    content = content.replace(/order: 5/g, `order: ${db.order}`);
    content = content.replace(/- sqlite/g, `- ${db.key}`);

    // Replace title heading
    content = content.replace(
      /# 🚀 SQLite Performance Ledger/g,
      `# 🚀 ${db.adapterName} Performance Ledger`,
    );

    // Replace adapter-specific code paths
    content = content.replace(/src\/databases\/sqlite\//g, `src/databases/${db.codePathPrefix}/`);

    // Replace "on SQLite" references
    content = content.replace(/on SQLite/g, `on ${db.adapterName}`);

    // Replace the database name in descriptions
    content = content.replace(/the SQLite adapter/g, `the ${db.adapterName} adapter`);

    // Replace results path reference
    content = content.replace(/results\/sqlite\//g, `results/${db.key}/`);

    // Update metrics source
    content = content.replace(
      /\*\*Canonical history\*\*: `tests\/benchmarks\/results\/history\.sqlite`/g,
      `**Canonical history**: \`tests/benchmarks/results/history.sqlite\` (shared across all databases)`,
    );

    // Write the file
    const outPath = path.resolve(process.cwd(), `docs/project/benchmarks/benchmark_${db.key}.mdx`);
    fs.writeFileSync(outPath, content, "utf8");
    console.log(`✅ Generated: benchmark_${db.key}.mdx`);
  }

  console.log(`\nDone! Generated ${DBS.length} reports.`);
}

generate();
