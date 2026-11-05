#!/usr/bin/env bun
/**
 * @file scripts/security/check-test-strength.ts
 * @description Mutation-score gate for the security surface.
 *
 * Line coverage says a statement ran; it does not say a test would notice if the
 * statement were wrong. `scripts/test/mutate-core.ts --security-only` rewrites one
 * seam at a time, runs the mapped unit suite, and restores the file. A mutation
 * that made the suite *pass* is a survivor — an assertion nobody wrote.
 *
 * This checker reads the report that run writes, aggregates mutation scores per
 * file and per area, and fails when an area falls below its floor in
 * `security-mutation-floors.json`.
 *
 * ### Usage
 *   bun run scripts/security/check-test-strength.ts
 *   bun run scripts/security/check-test-strength.ts --json
 *   bun run scripts/security/check-test-strength.ts --report=out.json --floors=my-floors.json
 *   bun run scripts/security/check-test-strength.ts --allow-missing
 *
 * ### Contract
 *   exit 0  every area is at or above its floor (or the report is absent with --allow-missing)
 *   exit 1  at least one area is below its floor
 *   exit 2  report absent without --allow-missing, or report/floors unreadable/malformed
 *
 * ### Features:
 * - longest-prefix area resolution (a file floor beats its directory floor)
 * - score = killed / (killed + survived); `invalid`/`aborted` never score
 * - per-file and per-area tables, `--json` for CI consumption
 * - `--allow-missing` so the PR corpus gate can run before the first mutation run
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_REPORT_PATH = ".mutation/report.json";
const FLOORS_PATH = join(import.meta.dirname, "security-mutation-floors.json");
const DEFAULT_AREA = "(default)";

/** Shape of `scripts/security/security-mutation-floors.json`. */
export interface FloorsFile {
  version: number;
  updated_at: string;
  default: number;
  floors: Record<string, number>;
}

/** The subset of a mutation report this checker relies on. */
export interface ReportEntry {
  id: string;
  file: string;
  status: "killed" | "survived" | "invalid" | "aborted";
}

export interface MutationReportLike {
  version?: number;
  generated_at?: string;
  mode?: string;
  mutations: ReportEntry[];
}

export interface FileScore {
  file: string;
  area: string;
  floor: number;
  killed: number;
  survived: number;
  invalid: number;
  aborted: number;
  /** Percent (0–100, one decimal), or null when no mutation was executable. */
  score: number | null;
}

export interface AreaScore {
  area: string;
  floor: number;
  killed: number;
  survived: number;
  invalid: number;
  aborted: number;
  score: number | null;
  ok: boolean;
  files: FileScore[];
}

export interface StrengthEvaluation {
  ok: boolean;
  areas: AreaScore[];
  files: FileScore[];
}

export interface CheckOptions {
  reportPath?: string;
  floorsPath?: string;
  allowMissing?: boolean;
  json?: boolean;
}

export interface CheckResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  evaluation?: StrengthEvaluation;
}

export interface CheckerArgs {
  reportPath: string;
  floorsPath: string;
  allowMissing: boolean;
  json: boolean;
  help: boolean;
}

const STATUS_KEYS = ["killed", "survived", "invalid", "aborted"] as const;

/** Normalise Windows separators and a leading `./` so prefixes match on every OS. */
export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Score in percent with one decimal, or null when nothing was executable. */
export function mutationScore(killed: number, survived: number): number | null {
  const executed = killed + survived;
  if (executed === 0) return null;
  return Math.round((killed / executed) * 1000) / 10;
}

/**
 * Resolve the floor for a file with longest-prefix matching. A directory entry
 * (`src/utils/security/`) matches its files; a file entry
 * (`src/utils/egress-guard.ts`) matches only itself and wins over the directory.
 */
export function resolveFloor(file: string, floors: FloorsFile): { area: string; floor: number } {
  const normalized = normalizePath(file);
  let best: { area: string; floor: number; length: number } | null = null;

  for (const [rawPrefix, floor] of Object.entries(floors.floors)) {
    const prefix = normalizePath(rawPrefix);
    if (!prefix) continue;
    const matches =
      normalized === prefix || normalized.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
    if (!matches) continue;
    if (!best || prefix.length > best.length) best = { area: prefix, floor, length: prefix.length };
  }

  return best
    ? { area: best.area, floor: best.floor }
    : { area: DEFAULT_AREA, floor: floors.default };
}

/** True when `value` has the minimum shape this checker can score. */
export function isFloorsFile(value: unknown): value is FloorsFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FloorsFile>;
  if (typeof candidate.default !== "number" || !Number.isFinite(candidate.default)) return false;
  if (!candidate.floors || typeof candidate.floors !== "object") return false;
  return Object.values(candidate.floors).every(
    (floor) => typeof floor === "number" && Number.isFinite(floor),
  );
}

/** Validate the report envelope before any arithmetic (a silent `[]` would score 100 %). */
export function parseReport(value: unknown): MutationReportLike {
  if (!value || typeof value !== "object") throw new Error("report is not a JSON object");
  const mutations = (value as { mutations?: unknown }).mutations;
  if (!Array.isArray(mutations)) throw new Error("report has no `mutations` array");

  const entries: ReportEntry[] = mutations.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`mutations[${index}] is not an object`);
    }
    const { id, file, status } = entry as Partial<ReportEntry>;
    if (typeof file !== "string" || !file) {
      throw new Error(`mutations[${index}] has no \`file\``);
    }
    if (typeof status !== "string" || !STATUS_KEYS.includes(status as ReportEntry["status"])) {
      throw new Error(
        `mutations[${index}] (${file}) has unknown status "${String(status)}"; expected one of ${STATUS_KEYS.join(", ")}`,
      );
    }
    return {
      id: typeof id === "string" && id ? id : `mutation-${index}`,
      file,
      status: status as ReportEntry["status"],
    };
  });

  const envelope = value as Partial<MutationReportLike>;
  return {
    version: envelope.version,
    generated_at: envelope.generated_at,
    mode: envelope.mode,
    mutations: entries,
  };
}

/** Aggregate files into areas and compare each area score against its floor. */
export function evaluateStrength(
  report: MutationReportLike,
  floors: FloorsFile,
): StrengthEvaluation {
  const byFile = new Map<string, FileScore>();

  for (const entry of report.mutations) {
    const file = normalizePath(entry.file);
    let row = byFile.get(file);
    if (!row) {
      const { area, floor } = resolveFloor(file, floors);
      row = { file, area, floor, killed: 0, survived: 0, invalid: 0, aborted: 0, score: null };
      byFile.set(file, row);
    }
    row[entry.status] += 1;
  }

  const files = [...byFile.values()].map((row) => ({
    ...row,
    score: mutationScore(row.killed, row.survived),
  }));

  const areaMap = new Map<string, AreaScore>();
  const ensureArea = (area: string, floor: number): AreaScore => {
    let bucket = areaMap.get(area);
    if (!bucket) {
      bucket = {
        area,
        floor,
        killed: 0,
        survived: 0,
        invalid: 0,
        aborted: 0,
        score: null,
        ok: true,
        files: [],
      };
      areaMap.set(area, bucket);
    }
    return bucket;
  };

  // Configured areas stay visible even when the report has no data for them —
  // otherwise a stale floor file silently drops an area from the gate.
  for (const prefix of Object.keys(floors.floors)) {
    const area = normalizePath(prefix);
    ensureArea(area, floors.floors[prefix]);
  }

  for (const file of files) {
    const bucket = ensureArea(file.area, file.floor);
    bucket.killed += file.killed;
    bucket.survived += file.survived;
    bucket.invalid += file.invalid;
    bucket.aborted += file.aborted;
    bucket.files.push(file);
  }

  const areas = [...areaMap.values()].map((bucket) => {
    const score = mutationScore(bucket.killed, bucket.survived);
    return {
      ...bucket,
      score,
      ok: score === null ? true : score >= bucket.floor,
      files: bucket.files.sort((a, b) => a.file.localeCompare(b.file)),
    };
  });

  return { ok: areas.every((area) => area.ok), areas, files };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

function formatScore(score: number | null): string {
  return score === null ? "n/a" : score.toFixed(1);
}

/** Human-readable report body (no trailing newline). */
export function formatTable(evaluation: StrengthEvaluation): string {
  const areaWidth = Math.max(...evaluation.areas.map((area) => area.area.length), 4);
  const lines: string[] = ["== Mutation score vs floors =="];
  lines.push(`${pad("area", areaWidth)}  floor  score  killed  survived  invalid  aborted  status`);
  lines.push(`${"-".repeat(areaWidth)}  -----  -----  ------  --------  -------  -------  ------`);

  for (const area of evaluation.areas) {
    const status = area.score === null ? "no-data" : area.ok ? "pass" : "FAIL";
    lines.push(
      `${pad(area.area, areaWidth)}  ${String(area.floor).padStart(5)}  ` +
        `${formatScore(area.score).padStart(5)}  ${String(area.killed).padStart(6)}  ` +
        `${String(area.survived).padStart(8)}  ${String(area.invalid).padStart(7)}  ` +
        `${String(area.aborted).padStart(7)}  ${status}`,
    );
  }

  const scored = evaluation.files.filter((file) => file.score !== null);
  if (scored.length > 0) {
    lines.push("", "== Files ==");
    for (const file of scored.sort((a, b) => a.file.localeCompare(b.file))) {
      lines.push(
        `${file.file}  ${formatScore(file.score)}%  ` +
          `(${file.killed} killed / ${file.survived} survived)`,
      );
    }
  }

  return lines.join("\n");
}

export function parseArgs(argv: readonly string[]): CheckerArgs {
  const args: CheckerArgs = {
    reportPath: DEFAULT_REPORT_PATH,
    floorsPath: FLOORS_PATH,
    allowMissing: false,
    json: false,
    help: false,
  };

  const takeValue = (index: number, flag: string, inline: string | undefined): [string, number] => {
    if (inline !== undefined) {
      if (!inline) throw new Error(`${flag} needs a non-empty path`);
      return [inline, index];
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${flag} needs a path`);
    return [next, index + 1];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-missing") {
      args.allowMissing = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--report" || arg.startsWith("--report=")) {
      const [value, consumed] = takeValue(
        index,
        "--report",
        arg.startsWith("--report=") ? arg.slice("--report=".length) : undefined,
      );
      args.reportPath = value;
      index = consumed;
      continue;
    }
    if (arg === "--floors" || arg.startsWith("--floors=")) {
      const [value, consumed] = takeValue(
        index,
        "--floors",
        arg.startsWith("--floors=") ? arg.slice("--floors=".length) : undefined,
      );
      args.floorsPath = value;
      index = consumed;
      continue;
    }
    throw new Error(`unknown argument "${arg}"`);
  }

  return args;
}

function readJson(path: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`cannot read ${label} at ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${label} at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Run the gate without printing. Everything the CLI needs is in the result, so
 * unit tests can assert exit codes and exact notices against fixtures.
 */
export function runCheck(options: CheckOptions = {}): CheckResult {
  const reportPath = resolve(options.reportPath ?? DEFAULT_REPORT_PATH);
  const floorsPath = resolve(options.floorsPath ?? FLOORS_PATH);
  const allowMissing = options.allowMissing === true;

  let floorsValue: unknown;
  try {
    floorsValue = readJson(floorsPath, "floors file");
  } catch (error) {
    return { exitCode: 2, stdout: "", stderr: `🛑 ${(error as Error).message}` };
  }
  if (!isFloorsFile(floorsValue)) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `🛑 ${floorsPath} is not a valid floors file (needs numeric \`default\` and \`floors\`)`,
    };
  }
  const floors = floorsValue;

  let reportValue: unknown;
  try {
    reportValue = readJson(reportPath, "mutation report");
  } catch {
    const notice =
      `No mutation report at ${reportPath}.\n` +
      "Run `bun run test:mutation:security` first (it writes .mutation/report.json), " +
      "then re-run `bun run scripts/security/check-test-strength.ts`.";
    return allowMissing
      ? { exitCode: 0, stdout: `ℹ️  ${notice}`, stderr: "" }
      : { exitCode: 2, stdout: "", stderr: `🛑 ${notice}` };
  }

  let report: MutationReportLike;
  try {
    report = parseReport(reportValue);
  } catch (error) {
    return { exitCode: 2, stdout: "", stderr: `🛑 ${(error as Error).message}` };
  }

  const evaluation = evaluateStrength(report, floors);

  if (options.json) {
    return {
      exitCode: evaluation.ok ? 0 : 1,
      stdout: JSON.stringify(
        {
          ok: evaluation.ok,
          generated_at: report.generated_at ?? null,
          report_mode: report.mode ?? null,
          floors: { updated_at: floors.updated_at, default: floors.default },
          areas: evaluation.areas.map(({ files, ...area }) => ({
            ...area,
            files: files.map((file) => file.file),
          })),
          files: evaluation.files,
        },
        null,
        2,
      ),
      stderr: "",
      evaluation,
    };
  }

  const breaches = evaluation.areas.filter((area) => !area.ok);
  const stdout = [
    formatTable(evaluation),
    "",
    breaches.length === 0
      ? "✅ Every scored area is at or above its floor."
      : `🛑 ${breaches.length} area(s) below floor: ${breaches
          .map((area) => `${area.area} ${formatScore(area.score)}% < ${area.floor}%`)
          .join(", ")}`,
  ].join("\n");

  const noData = evaluation.areas.filter((area) => area.score === null).length;
  const stderr =
    noData > 0
      ? `ℹ️  ${noData} area(s) have no killed/survived mutations in this report (no-data does not fail the gate).`
      : "";

  return { exitCode: evaluation.ok ? 0 : 1, stdout, stderr, evaluation };
}

function main(): number {
  let args: CheckerArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`🛑 ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  if (args.help) {
    console.log(`
Usage: bun run scripts/security/check-test-strength.ts [--report=<path>] [--floors=<path>]
                                                       [--json] [--allow-missing]

  --report=<path>   mutation report (default ${DEFAULT_REPORT_PATH}); the spaced
                    form (--report <path>) is accepted too
  --floors=<path>   floors file (default scripts/security/security-mutation-floors.json)
  --json            emit machine-readable JSON
  --allow-missing   exit 0 with a notice when the report does not exist yet
`);
    return 0;
  }

  const result = runCheck(args);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  return result.exitCode;
}

if (import.meta.main) {
  process.exit(main());
}
