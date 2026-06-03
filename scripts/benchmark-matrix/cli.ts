/**
 * @file scripts/benchmark-matrix/cli.ts
 * @description CLI entry point for the benchmark matrix tool.
 *
 * Features:
 * - clean section-based organization
 * - centralized ANSI helpers
 * - robust argument parsing
 * - consistent visual output
 */

import { version as pkgVersion } from "../../package.json";
import { ALL_DATABASES, DB_METADATA, BENCHMARK_SCRIPTS } from "./config";
import type { RunConfig, BenchmarkScript, DatabaseConfig, HostInfo } from "./types";
import os from "node:os";

// ====================== CONSTANTS ======================

const DEFAULT_RETRY = 1;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MIN_TIMEOUT_MS = 10_000;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[38;5;39m",
  orange: "\x1b[38;5;208m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
} as const;

// ====================== HELPERS ======================

function color(text: string, c: keyof typeof ANSI): string {
  return `${ANSI[c]}${text}${ANSI.reset}`;
}

function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

// ====================== HOST INFO ======================

export async function collectHostInfo(): Promise<HostInfo> {
  const cpus = os.cpus();
  const memoryGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);

  return {
    cpu: cpus[0]?.model?.trim() || "Unknown CPU",
    cores: cpus.length,
    ram: `${memoryGB}GB`,
    os: os.type(),
    arch: os.arch(),
    runtime: `Bun ${process.versions.bun || "N/A"} / Node ${process.version}`,
  };
}

// ====================== ARGUMENT PARSING ======================

function getArg(argv: string[], key: string): string | null {
  const index = argv.findIndex((a) => a === key || a.startsWith(`${key}=`));
  if (index === -1) return null;

  const arg = argv[index];
  if (arg.includes("=")) {
    return arg.split("=").slice(1).join("=");
  }
  return argv[index + 1] ?? null;
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.some((a) => a === key || a.startsWith(`${key}=`));
}

export function parseArgs(): RunConfig {
  const argv = process.argv.slice(2);

  const parallelRaw = getArg(argv, "--parallel") ?? "off";
  const parallelMode: "off" | "safe" | "full" =
    parallelRaw === "full" ? "full" : parallelRaw === "safe" ? "safe" : "off";

  let dbRaw = getArg(argv, "--db");
  if (dbRaw) dbRaw = dbRaw.replace(/sqllite/gi, "sqlite");

  const sqlFlag = hasFlag(argv, "--sql") || hasFlag(argv, "--sqlite") || hasFlag(argv, "--sqllite");

  let skipBuild = hasFlag(argv, "--no-build") || hasFlag(argv, "--skip-build");
  if (skipBuild) {
    try {
      const buildTime = Bun.file("build/index.js").lastModified;
      const srcTime = Bun.file("src/databases/db.ts").lastModified;

      if (srcTime > buildTime || buildTime === 0) {
        console.warn(
          `\n${color("⚠️  [WARNING] '--no-build' ignored: Source code is newer than the build cache (or build is missing). Forcing a fresh build...", "yellow")}\n`,
        );
        skipBuild = false;
      }
    } catch {
      skipBuild = false;
    }
  }

  // Build dbFilter: only set when a --db flag or --sql/--sqlite shortcut was provided.
  // Otherwise leave as null so filterDatabases() returns all 8 configurations.
  const dbFilterRaw = dbRaw || (sqlFlag ? "sqlite" : "");
  const dbFilter: string[] | null = dbFilterRaw
    ? dbFilterRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : null;

  const cfg: RunConfig = {
    parallelMode,
    skipBuild,
    dbFilter,
    sectionFilter:
      getArg(argv, "--section")
        ?.split(",")
        .map((s) => s.trim().toLowerCase()) ?? null,
    levelFilter: (() => {
      const level = getArg(argv, "--level");
      return level ? parseInt(level, 10) : null;
    })(),
    onlyFilter:
      getArg(argv, "--only")
        ?.split(",")
        .map((s) => s.trim().toLowerCase()) ?? null,
    fileFilter: getArg(argv, "--file"),
    skipRedis: hasFlag(argv, "--skip-redis"),
    retryCount: Math.max(0, parseInt(getArg(argv, "--retry") || String(DEFAULT_RETRY), 10)),
    timeoutMs: Math.max(
      DEFAULT_MIN_TIMEOUT_MS,
      parseInt(getArg(argv, "--timeout") || String(DEFAULT_TIMEOUT_MS), 10),
    ),
    warmup: !hasFlag(argv, "--no-warmup"),
    ci: hasFlag(argv, "--ci"),
    failFast: !hasFlag(argv, "--no-fail-fast"),
    forceClean: hasFlag(argv, "--force-clean") || hasFlag(argv, "--clean"),
    list: hasFlag(argv, "--list"),
    differential: hasFlag(argv, "--differential"),
    changedFiles: hasFlag(argv, "--differential") ? getGitChangedFiles() : [],
  };

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log("[DEBUG] Parsed Config:", JSON.stringify(cfg, null, 2));
  }

  return cfg;
}

// ====================== PRINTING HELPERS ======================

export function printHeader(host: HostInfo) {
  console.log(`\n${bold(color(`🏢 SveltyCMS Enterprise Audit v${pkgVersion}`, "orange"))}`);
  console.log(
    `${ANSI.gray}Host: ${host.cpu} (${host.cores} cores) | OS: ${host.os} | Runtime: ${host.runtime}${ANSI.reset}\n`,
  );
}

export function printIntensityLegend(totalEstimateMs: number, totalDatabases: number) {
  const estimatedMinutes = Math.round((totalEstimateMs / 1000 / 60) * totalDatabases);

  console.log(bold("INTENSITY LEGEND:"));
  console.log(
    `  ${ANSI.green}low${ANSI.reset}: I/O bound (~10s)  ${ANSI.yellow}medium${ANSI.reset}: Significant logic (~30s)  ${ANSI.red}high${ANSI.reset}: CPU saturated (~60s+)`,
  );
  console.log(
    `${ANSI.gray}  Total Suite Estimate: ~${estimatedMinutes} minutes for all databases.${ANSI.reset}\n`,
  );
}

export function printUsage() {
  console.log(bold("USAGE"));
  console.log(`  bun run scripts/benchmark-matrix/index.ts [options]\n`);
}

export function printCLIOptions() {
  console.log(bold("CLI OPTIONS"));

  const options: [string, string][] = [
    ["--parallel=<mode>", "off | safe | full (safe = intensity locking)"],
    ["--no-build", "Skip production build phase"],
    ["--db=<types>", "Comma-separated (e.g. sqlite,postgresql,mariadb)"],
    ["--sql, --sqlite", "Shortcut for --db=sqlite"],
    ["--section=<names>", "baseline,adapter,internals,logic,api,scale"],
    ["--level=<0-5>", "Maximum benchmark level to run"],
    ["--only=<labels>", "Filter by short labels (e.g. REST,GraphQL)"],
    ["--file=<path>", "Run only one specific benchmark file"],
    ["--skip-redis", "Skip Redis-backed variants"],
    ["--retry=<n>", `Retry count (default: ${DEFAULT_RETRY})`],
    ["--timeout=<ms>", `Per-script timeout (default: ${DEFAULT_TIMEOUT_MS})`],
    ["--no-warmup", "Disable server warmup requests"],
    ["--ci", "CI mode: compact output + strict exit codes"],
    ["--no-fail-fast", "Continue even if some benchmarks fail"],
    ["--force-clean, --clean", "Force clean state before run"],
  ];

  for (const [flag, desc] of options) {
    console.log(`  ${ANSI.cyan}${flag.padEnd(20)}${ANSI.reset}${desc}`);
  }

  console.log(
    `  ${ANSI.magenta}PROF_MODE=0x${ANSI.reset}         Enable 0x flamegraph profiling\n`,
  );
}

export function printAvailableDatabases() {
  console.log(bold("AVAILABLE DATABASES"));

  const grouped = ALL_DATABASES.reduce<Record<string, string[]>>((acc, db) => {
    const type = db.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(db.label || db.type.toUpperCase());
    return acc;
  }, {});

  for (const [type, labels] of Object.entries(grouped)) {
    const meta = DB_METADATA[type as keyof typeof DB_METADATA] || {
      icon: "❓",
    };
    console.log(`  ${meta.icon}  ${bold(type.toUpperCase().padEnd(12))}: ${labels.join(", ")}`);
  }
  console.log();
}

// ====================== BENCHMARK LIST ======================

export function printBenchmarkScripts(isWide: boolean, cols: number) {
  console.log(bold(`BENCHMARK SCRIPTS (${BENCHMARK_SCRIPTS.length} total)`));

  const sections = [...new Set(BENCHMARK_SCRIPTS.map((s) => s.section))];

  const SECTION_DESCS: Record<string, string> = {
    baseline: "Core system readiness and network overhead",
    adapter: "Low-level database CRUD and transaction performance",
    internals: "Caching, middleware, and scanning efficiency",
    logic: "Server-side processing and complex queries",
    api: "End-to-end REST, GraphQL, and security performance",
    scale: "Multi-tenancy and sustained workload stability",
  };

  for (const section of sections) {
    const desc = SECTION_DESCS[section] || "";
    console.log(
      `\n  ${bold(color(`[${section.toUpperCase()}]`, "yellow"))} ${ANSI.gray}— ${desc}${ANSI.reset}`,
    );

    const scripts = BENCHMARK_SCRIPTS.filter((s) => s.section === section);

    for (const s of scripts) {
      const intensityColor =
        s.intensity === "high" ? ANSI.red : s.intensity === "medium" ? ANSI.yellow : ANSI.green;
      const timeStr = `${ANSI.gray}${(s.estimatedMs / 1000).toFixed(0)}s${ANSI.reset}`;

      if (isWide) {
        console.log(
          `    L${s.level}  ${ANSI.cyan}${s.shortLabel.padEnd(12)}${ANSI.reset} ${s.label.padEnd(35)} ` +
            `${ANSI.gray}${s.path.padEnd(50)}${ANSI.reset} (${intensityColor}${s.intensity}${ANSI.reset}) ${timeStr}`,
        );
      } else {
        const meta = `(${intensityColor}${s.intensity}${ANSI.reset}) ${timeStr}`;
        const dots = ".".repeat(Math.max(3, cols - 45 - s.label.length - meta.length));
        console.log(
          `    L${s.level}  ${ANSI.cyan}${s.shortLabel.padEnd(12)}${ANSI.reset} ${s.label} ${ANSI.gray}${dots}${ANSI.reset}${meta}`,
        );
        console.log(`          ${ANSI.gray}${s.path}${ANSI.reset}`);
      }
    }
  }
}

export async function printList() {
  const host = await collectHostInfo();
  const cols = process.stdout.columns || 120;
  const isWide = cols > 150;

  const totalEstimateMs = BENCHMARK_SCRIPTS.reduce((sum, s) => sum + s.estimatedMs, 0);
  const totalDbs = ALL_DATABASES.length;

  printHeader(host);
  printIntensityLegend(totalEstimateMs, totalDbs);
  printUsage();
  printCLIOptions();
  printAvailableDatabases();
  printBenchmarkScripts(isWide, cols);
  console.log();
}

// ====================== FILTERS ======================

export function filterScripts(cfg: RunConfig): BenchmarkScript[] {
  return BENCHMARK_SCRIPTS.filter((script) => {
    if (cfg.fileFilter && script.path !== cfg.fileFilter) return false;
    if (cfg.sectionFilter && !cfg.sectionFilter.includes(script.section)) return false;
    if (cfg.levelFilter !== null && script.level > cfg.levelFilter) return false;
    if (cfg.onlyFilter) {
      const labelLower = script.label.toLowerCase();
      const shortLower = script.shortLabel.toLowerCase();
      return cfg.onlyFilter.some(
        (filter) => labelLower.includes(filter) || shortLower.includes(filter),
      );
    }
    return true;
  }).filter((script) => {
    // 🚀 Differential execution: only run tests whose codePaths overlap with changed files
    if (cfg.differential && cfg.changedFiles.length > 0) {
      if (!script.codePaths || script.codePaths.length === 0) return true;
      return script.codePaths.some((p) =>
        cfg.changedFiles.some((changed) => changed.includes(p) || p.includes(changed)),
      );
    }
    return true;
  });
}

/** Get files changed in the most recent git commit. */
function getGitChangedFiles(): string[] {
  try {
    const { execSync } = require("node:child_process");
    const output = execSync("git diff --name-only HEAD~1..HEAD", {
      encoding: "utf8",
    }).trim();
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function filterDatabases(cfg: RunConfig): DatabaseConfig[] {
  return ALL_DATABASES.filter((db) => {
    if (cfg.skipRedis && db.useRedis) return false;

    if (cfg.dbFilter) {
      const dbKey = (db.label || db.type).toLowerCase().replace("+", "-");
      const typeLower = db.type.toLowerCase();
      return cfg.dbFilter.includes(typeLower) || cfg.dbFilter.includes(dbKey);
    }

    return true;
  });
}
