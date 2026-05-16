/**
 * @file scripts\benchmark-matrix\cli.ts
 * @description CLI entry point for the benchmark matrix tool.
 */

import { version as pkgVersion } from "../../package.json";
import { ALL_DATABASES, DB_METADATA, BENCHMARK_SCRIPTS } from "./config";
import type { RunConfig, BenchmarkScript, DatabaseConfig, HostInfo } from "./types";
import os from "node:os";

/**
 * Collects host environment information.
 */
export async function collectHostInfo(): Promise<HostInfo> {
  const cpus = os.cpus();
  const memory = Math.round(os.totalmem() / 1024 / 1024 / 1024);

  return {
    cpu: cpus[0]?.model?.trim() || "Unknown CPU",
    cores: cpus.length,
    ram: `${memory}GB`,
    os: os.type(),
    arch: os.arch(),
    runtime: `Bun ${process.versions.bun || "N/A"} / Node ${process.version}`,
  };
}

/**
 * Parses CLI arguments into a RunConfig object.
 */
export function parseArgs(): RunConfig {
  const argv = process.argv.slice(2);

  const getArg = (key: string): string | null => {
    const idx = argv.findIndex((a) => a === key || a.startsWith(`${key}=`));
    if (idx === -1) return null;
    if (argv[idx].includes("=")) return argv[idx].split("=").slice(1).join("=");
    return argv[idx + 1] ?? null;
  };

  const hasFlag = (key: string) => argv.some((a) => a === key || a.startsWith(`${key}=`));

  const parallelRaw = getArg("--parallel") ?? "off";
  const parallelMode: "off" | "safe" | "full" =
    parallelRaw === "full" ? "full" : parallelRaw === "safe" ? "safe" : "off";

  const dbRaw = getArg("--db");
  const sqlFlag = hasFlag("--sql") || hasFlag("--sqlite");
  const finalDbRaw = dbRaw || (sqlFlag ? "sqlite" : null);

  const sectionRaw = getArg("--section");
  const levelRaw = getArg("--level");
  const onlyRaw = getArg("--only");
  const fileRaw = getArg("--file");
  const retryRaw = parseInt(getArg("--retry") || "1", 10);
  const timeoutRaw = parseInt(getArg("--timeout") || "300000", 10);

  const cfg: RunConfig = {
    parallelMode,
    skipBuild: hasFlag("--no-build"),
    dbFilter: finalDbRaw ? finalDbRaw.split(",").map((s) => s.trim().toLowerCase()) : null,
    sectionFilter: sectionRaw ? sectionRaw.split(",").map((s) => s.trim().toLowerCase()) : null,
    levelFilter: levelRaw !== null ? parseInt(levelRaw, 10) : null,
    onlyFilter: onlyRaw ? onlyRaw.split(",").map((s) => s.trim().toLowerCase()) : null,
    fileFilter: fileRaw,
    skipRedis: hasFlag("--skip-redis"),
    retryCount: Number.isNaN(retryRaw) ? 1 : Math.max(0, retryRaw),
    timeoutMs: Number.isNaN(timeoutRaw) ? 1_200_000 : Math.max(10_000, timeoutRaw),
    warmup: !hasFlag("--no-warmup"),
    ci: hasFlag("--ci"),
    failFast: !hasFlag("--no-fail-fast"),
    forceClean: hasFlag("--force-clean") || hasFlag("--clean"),
    list: hasFlag("--list"),
  };

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log("[DEBUG] Parsed Config:", JSON.stringify(cfg, null, 2));
  }

  return cfg;
}

// --- PRINT HELPERS ---

export function printHeader(host: HostInfo) {
  console.log(`\n\x1b[1m\x1b[38;5;208m🏢 SveltyCMS Enterprise Audit v${pkgVersion}\x1b[0m`);
  console.log(
    `\x1b[37mHost: ${host.cpu} (${host.cores} cores) | OS: ${host.os} | Runtime: ${host.runtime}\x1b[0m\n`,
  );
}

export function printIntensityLegend(totalEstimateMs: number, totalDatabases: number) {
  console.log(`\x1b[1mINTENSITY LEGEND:\x1b[0m`);
  console.log(
    `  \x1b[32mlow\x1b[0m: I/O bound (~10s)  \x1b[33mmedium\x1b[0m: Significant logic (~30s)  \x1b[31mhigh\x1b[0m: CPU saturated (~60s+)`,
  );
  console.log(
    `  \x1b[90mTotal Suite Estimate: ~${Math.round((totalEstimateMs / 1000 / 60) * totalDatabases)} minutes for all databases.\x1b[0m\n`,
  );
}

export function printUsage() {
  console.log(`\x1b[1mUSAGE\x1b[0m`);
  console.log(`  bun run scripts/benchmark-matrix/index.ts [options]\n`);
}

export function printCLIOptions() {
  console.log(`\x1b[1mCLI OPTIONS\x1b[0m`);
  const options = [
    ["--parallel=<mode>", "off | safe | full. 'safe' uses intensity locking."],
    ["--no-build", "Skip the production build phase."],
    ["--db=<types>", "Comma-separated DB types (e.g., sqlite,postgresql)."],
    ["--sql, --sqlite", "Alias for --db=sqlite."],
    ["--section=<names>", "Filter by section (baseline, adapter, internals, logic, api, scale)."],
    ["--level=<0-5>", "Run only benchmarks at this level or below."],
    ["--only=<labels>", "Filter by short labels (e.g., REST, GraphQL)."],
    ["--file=<path>", "Run only a single specific benchmark file."],
    ["--skip-redis", "Skip all Redis-backed database variants."],
    ["--retry=<n>", "Retry attempts for failed scripts (default: 1)."],
    ["--timeout=<ms>", "Timeout per script in ms (default: 300,000)."],
    ["--no-warmup", "Disable JIT warmup pings before suite starts."],
    ["--ci", "CI mode: compact logs, exit 1 on regressions/violations."],
    ["--fail-fast", "Stop the entire suite immediately if any test fails."],
  ];
  for (const [flag, desc] of options) {
    console.log(`  \x1b[36m${flag.padEnd(18)}\x1b[0m ${desc}`);
  }
  console.log(`  \x1b[35mPROF_MODE=0x\x1b[0m       (Env) Enable 0x flamegraph profiling.\n`);
}

export function printAvailableDatabases() {
  console.log(`\x1b[1mAVAILABLE DATABASES\x1b[0m`);
  const dbsByGroup = ALL_DATABASES.reduce(
    (acc, db) => {
      if (!acc[db.type]) acc[db.type] = [];
      acc[db.type].push(db.label || db.type.toUpperCase());
      return acc;
    },
    {} as Record<string, string[]>,
  );

  for (const [type, labels] of Object.entries(dbsByGroup)) {
    const meta = DB_METADATA[type as keyof typeof DB_METADATA] || { icon: "❓" };
    const dbName = type.toUpperCase().padEnd(12);
    console.log(`  ${meta.icon}      \x1b[1m${dbName}\x1b[0m: ${labels.join(", ")}`);
  }
  console.log();
}

export function printBenchmarkScripts(isWide: boolean, cols: number) {
  const SECTION_DESCS: Record<string, string> = {
    baseline: "Core system readiness and network overhead",
    adapter: "Low-level database CRUD and transaction performance",
    internals: "Caching efficiency, middleware overhead, and scanning",
    logic: "Server-side processing for widgets and complex queries",
    api: "End-to-end REST, GraphQL, and Security performance",
    scale: "Multi-tenancy isolation and sustained workload stability",
  };

  console.log(
    `\x1b[1mBENCHMARK SCRIPTS (\x1b[38;5;39m${BENCHMARK_SCRIPTS.length} total\x1b[0m\x1b[1m)\x1b[0m`,
  );
  const sections = [...new Set(BENCHMARK_SCRIPTS.map((s) => s.section))];

  for (const sec of sections) {
    const desc = SECTION_DESCS[sec] || "";
    console.log(`\n  \x1b[1m\x1b[33m[${sec.toUpperCase()}]\x1b[0m \x1b[90m— ${desc}\x1b[0m`);
    const scripts = BENCHMARK_SCRIPTS.filter((x) => x.section === sec);

    for (const s of scripts) {
      const intensityColor =
        s.intensity === "high" ? "\x1b[31m" : s.intensity === "medium" ? "\x1b[33m" : "\x1b[32m";
      const timeStr = `\x1b[90m${(s.estimatedMs / 1000).toFixed(0)}s\x1b[0m`;
      const levelStr = `L${s.level}`;
      const shortLabel = `\x1b[36m${s.shortLabel.padEnd(12)}\x1b[0m`;

      if (isWide) {
        const titlePart = s.label.padEnd(35);
        const pathPart = `\x1b[90m${s.path.padEnd(50)}\x1b[0m`;
        const metaPart = ` (${intensityColor}${s.intensity.padStart(6)}\x1b[0m) ${timeStr.padStart(4)}`;
        console.log(`    ${levelStr}  ${shortLabel} ${titlePart} ${pathPart} ${metaPart}`);
      } else {
        const titlePart = s.label;
        const metaPart = ` (${intensityColor}${s.intensity}\x1b[0m) ${timeStr}`;
        const visibleLength =
          4 + 4 + 12 + titlePart.length + metaPart.replace(/\u001b\[[0-9;]*m/g, "").length; // eslint-disable-line no-control-regex
        const dots = ".".repeat(Math.max(2, cols - visibleLength - 5));

        console.log(
          `    ${levelStr}  ${shortLabel} ${titlePart} \u001b[90m${dots}\u001b[0m${metaPart}`,
        );
        console.log(`          \x1b[90m${s.path}\x1b[0m`);
      }
    }
  }
}

/**
 * Lists all available benchmarks and options.
 */
export async function printList() {
  const host = await collectHostInfo();
  const cols = process.stdout.columns || 120;
  const isWide = cols > 150;

  const totalEstimateMs = BENCHMARK_SCRIPTS.reduce((acc, s) => acc + s.estimatedMs, 0);
  const totalDatabases = ALL_DATABASES.length;

  printHeader(host);
  printIntensityLegend(totalEstimateMs, totalDatabases);
  printUsage();
  printCLIOptions();
  printAvailableDatabases();
  printBenchmarkScripts(isWide, cols);
  console.log();
}

/**
 * Filters the benchmark scripts based on the configuration.
 */
export function filterScripts(cfg: RunConfig): BenchmarkScript[] {
  return BENCHMARK_SCRIPTS.filter((s) => {
    if (cfg.fileFilter && s.path !== cfg.fileFilter) return false;
    if (cfg.sectionFilter && !cfg.sectionFilter.includes(s.section)) return false;
    if (cfg.levelFilter !== null && s.level > cfg.levelFilter) return false;
    if (
      cfg.onlyFilter &&
      !cfg.onlyFilter.some(
        (l) => s.shortLabel.toLowerCase().includes(l) || s.label.toLowerCase().includes(l),
      )
    )
      return false;
    return true;
  });
}

/**
 * Filters the databases based on the configuration.
 */
export function filterDatabases(cfg: RunConfig): DatabaseConfig[] {
  return ALL_DATABASES.filter((db) => {
    const dbKey = (db.label || db.type).toLowerCase().replace("+", "-");
    if (cfg.skipRedis && db.useRedis) return false;
    if (
      cfg.dbFilter &&
      !cfg.dbFilter.includes(db.type.toLowerCase()) &&
      !cfg.dbFilter.includes(dbKey)
    )
      return false;
    return true;
  });
}
