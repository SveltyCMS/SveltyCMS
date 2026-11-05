/**
 * @file scripts/security/check-external-validation.ts
 * @description Fail-closed gate for the externally verifiable security evidence
 *   recorded in `docs/security/external-validation.json`.
 *
 * The record is the machine-readable counterpart of
 * `docs/reference/security/security-case.mdx`. It starts fully `pending`
 * (2026-11-05) and is only updated when evidence exists: a dated penetration
 * test, a live bug-bounty programme, a Scorecard score, a SLSA level, or a
 * Sigstore identity. This script keeps the record honest instead of letting a
 * stale entry imply coverage that is no longer current.
 *
 * ### Features:
 * - Valibot schema (strict object) for every status, date, and score field
 * - Freshness rules: completed pen test ≤ 365 days, review ≤ 180 days
 * - Scorecard rule: a `tracked` score must be at or above `target_score`
 * - Human-readable table (default `--check`) and stable `--json` output
 * - Exit codes: 0 current, 1 schema/freshness violation, 2 I/O or usage error
 * - Import-safe: `main()` runs only when the file is executed directly
 *
 * ### Usage
 *   bun run scripts/security/check-external-validation.ts
 *   bun run scripts/security/check-external-validation.ts --json
 *   bun run scripts/security/check-external-validation.ts --file=docs/security/external-validation.json
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as v from "valibot";

/** Maximum age of a completed penetration test before it is stale. */
export const PEN_TEST_MAX_AGE_DAYS = 365;

/** Maximum age of `last_reviewed_at` before the whole record is stale. */
export const REVIEW_MAX_AGE_DAYS = 180;

const DAY_MS = 86_400_000;

/** Repository-relative record path, used for stable human/JSON output. */
export const DEFAULT_DOCUMENT_SOURCE = "docs/security/external-validation.json";

/** Absolute record path used when `--file` is omitted. */
export const DEFAULT_DOCUMENT_PATH = join(import.meta.dirname, "../..", DEFAULT_DOCUMENT_SOURCE);

const IsoDateSchema = v.pipe(
  v.string(),
  v.isoDate(),
  v.check(
    (value) => Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)),
    "Expected a calendar date (YYYY-MM-DD)",
  ),
);

const NullableTextSchema = v.nullable(v.pipe(v.string(), v.minLength(1)));
const NullableUrlSchema = v.nullable(v.pipe(v.string(), v.url()));

const PenetrationTestSchema = v.strictObject({
  status: v.picklist(["pending", "scheduled", "completed"]),
  date: v.nullable(IsoDateSchema),
  provider: NullableTextSchema,
  report_url: NullableUrlSchema,
  scope: v.pipe(v.string(), v.minLength(1)),
});

const BugBountySchema = v.strictObject({
  status: v.picklist(["pending", "live", "paused"]),
  platform: NullableTextSchema,
  url: NullableUrlSchema,
  scope_url: NullableUrlSchema,
});

const ScorecardSchema = v.strictObject({
  status: v.picklist(["pending", "tracked"]),
  target_score: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
  latest_score: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(10))),
  report_url: NullableUrlSchema,
});

const SlsaSchema = v.strictObject({
  status: v.picklist(["pending", "planned", "achieved"]),
  level: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4))),
});

const SigstoreSchema = v.strictObject({
  status: v.picklist(["pending", "enabled"]),
  identity: NullableTextSchema,
});

/** Full record schema. Strict objects turn a renamed field into a failure. */
export const ExternalValidationSchema = v.strictObject({
  version: v.literal(1),
  updated_at: IsoDateSchema,
  penetration_test: PenetrationTestSchema,
  bug_bounty: BugBountySchema,
  openssf_scorecard: ScorecardSchema,
  slsa: SlsaSchema,
  sigstore: SigstoreSchema,
  last_reviewed_at: IsoDateSchema,
});

export type ExternalValidationDocument = v.InferOutput<typeof ExternalValidationSchema>;

export interface ExternalValidationFailure {
  field: string;
  message: string;
}

export interface ExternalValidationEvaluation {
  ok: boolean;
  failures: ExternalValidationFailure[];
  document: ExternalValidationDocument;
}

export interface ExternalValidationStatusSummary {
  penetration_test: string;
  bug_bounty: string;
  openssf_scorecard: string;
  slsa: string;
  sigstore: string;
  last_reviewed_at: string;
}

export interface ExternalValidationJsonReport {
  ok: boolean;
  checked_at: string;
  source: string;
  failures: ExternalValidationFailure[];
  status: ExternalValidationStatusSummary;
}

type IssuePath = v.BaseIssue<unknown>["path"];

function formatIssuePath(path: IssuePath): string {
  if (!path) return "(root)";
  const segments = path.map((item) => String(item.key));
  return segments.length > 0 ? segments.join(".") : "(root)";
}

/** Validate raw JSON against the record schema. */
export function parseExternalValidation(
  raw: unknown,
): { success: true; document: ExternalValidationDocument } | { success: false; issues: string[] } {
  const result = v.safeParse(ExternalValidationSchema, raw);
  if (!result.success) {
    return {
      success: false,
      issues: result.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`),
    };
  }
  return { success: true, document: result.output };
}

function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days between an ISO calendar date and the UTC calendar day of `now`. */
function daysSince(isoDate: string, now: Date): number {
  const then = Date.parse(`${isoDate}T00:00:00.000Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - then) / DAY_MS);
}

/**
 * Apply the freshness and consistency rules to a schema-valid document.
 * `now` is injectable so unit tests do not depend on the wall clock.
 */
export function evaluateExternalValidation(
  document: ExternalValidationDocument,
  now: Date = new Date(),
): ExternalValidationEvaluation {
  const failures: ExternalValidationFailure[] = [];
  const penetrationTest = document.penetration_test;

  if (penetrationTest.status === "completed") {
    if (penetrationTest.date === null) {
      failures.push({
        field: "penetration_test.date",
        message: "A completed penetration test must record the report date.",
      });
    } else {
      const age = daysSince(penetrationTest.date, now);
      if (age < 0) {
        failures.push({
          field: "penetration_test.date",
          message: `The penetration-test date ${penetrationTest.date} is in the future.`,
        });
      } else if (age > PEN_TEST_MAX_AGE_DAYS) {
        failures.push({
          field: "penetration_test.date",
          message: `The penetration test is ${age} days old; the limit is ${PEN_TEST_MAX_AGE_DAYS}. Record a newer report or mark the entry pending.`,
        });
      }
    }
  }

  if (penetrationTest.status === "scheduled" && penetrationTest.date === null) {
    failures.push({
      field: "penetration_test.date",
      message: "A scheduled penetration test must record its planned date.",
    });
  }

  const scorecard = document.openssf_scorecard;
  if (scorecard.status === "tracked") {
    if (scorecard.latest_score === null) {
      failures.push({
        field: "openssf_scorecard.latest_score",
        message: "A tracked Scorecard must record its latest score.",
      });
    } else if (scorecard.latest_score < scorecard.target_score) {
      failures.push({
        field: "openssf_scorecard.latest_score",
        message: `The latest Scorecard score ${scorecard.latest_score} is below the target ${scorecard.target_score}.`,
      });
    }
  }

  const reviewAge = daysSince(document.last_reviewed_at, now);
  if (reviewAge < 0) {
    failures.push({
      field: "last_reviewed_at",
      message: `The review date ${document.last_reviewed_at} is in the future.`,
    });
  } else if (reviewAge > REVIEW_MAX_AGE_DAYS) {
    failures.push({
      field: "last_reviewed_at",
      message: `The record was last reviewed ${reviewAge} days ago; the limit is ${REVIEW_MAX_AGE_DAYS}. Re-review and update the date.`,
    });
  }

  return { ok: failures.length === 0, failures, document };
}

function statusSummary(document: ExternalValidationDocument): ExternalValidationStatusSummary {
  return {
    penetration_test: document.penetration_test.status,
    bug_bounty: document.bug_bounty.status,
    openssf_scorecard: document.openssf_scorecard.status,
    slsa: document.slsa.status,
    sigstore: document.sigstore.status,
    last_reviewed_at: document.last_reviewed_at,
  };
}

/** Build the stable machine-readable report used by `--json`. */
export function buildJsonReport(
  document: ExternalValidationDocument,
  evaluation: ExternalValidationEvaluation,
  options: { now?: Date; source?: string } = {},
): ExternalValidationJsonReport {
  const now = options.now ?? new Date();
  return {
    ok: evaluation.ok,
    checked_at: isoDateOf(now),
    source: options.source ?? DEFAULT_DOCUMENT_SOURCE,
    failures: evaluation.failures,
    status: statusSummary(document),
  };
}

function describePenetrationTest(document: ExternalValidationDocument): string {
  const entry = document.penetration_test;
  return entry.date === null ? entry.status : `${entry.status} (${entry.date})`;
}

function describeScorecard(document: ExternalValidationDocument): string {
  const entry = document.openssf_scorecard;
  if (entry.status !== "tracked" || entry.latest_score === null) return entry.status;
  return `${entry.status} (${entry.latest_score}/${entry.target_score})`;
}

function describeSlsa(document: ExternalValidationDocument): string {
  const entry = document.slsa;
  return entry.level === null ? entry.status : `${entry.status} (level ${entry.level})`;
}

function describeSigstore(document: ExternalValidationDocument): string {
  const entry = document.sigstore;
  return entry.identity === null ? entry.status : `${entry.status} (${entry.identity})`;
}

/** Render the human-readable status table. */
export function renderStatusTable(
  document: ExternalValidationDocument,
  evaluation: ExternalValidationEvaluation,
  now: Date = new Date(),
  source: string = DEFAULT_DOCUMENT_SOURCE,
): string {
  const rows: string[][] = [
    [
      "Penetration test",
      describePenetrationTest(document),
      "External report; 365-day freshness limit",
    ],
    ["Bug bounty", document.bug_bounty.status, "Public programme status"],
    ["OpenSSF Scorecard", describeScorecard(document), "Tracked score must meet the target"],
    ["SLSA", describeSlsa(document), "Build provenance level, recorded when planned or achieved"],
    ["Sigstore", describeSigstore(document), "Signing identity recorded only when enabled"],
    [
      "Last review",
      document.last_reviewed_at,
      `${daysSince(document.last_reviewed_at, now)} days ago; 180-day limit`,
    ],
  ];

  const headers = ["Check", "Status", "Detail"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const formatRow = (cells: string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd();

  const lines = [
    `External validation record — ${source}`,
    "",
    formatRow(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(formatRow),
    "",
  ];

  if (evaluation.ok) {
    lines.push("✓ All external-validation entries are current.");
  } else {
    lines.push(`✖ ${evaluation.failures.length} external-validation rule(s) failed:`);
    for (const failure of evaluation.failures) {
      lines.push(`  • ${failure.field}: ${failure.message}`);
    }
  }

  return lines.join("\n");
}

export interface CliOptions {
  json: boolean;
  file: string;
}

export type CliParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

/** Parse `--json` / `--check` / `--file`. Unknown flags fail closed. */
export function parseCliArgs(argv: readonly string[]): CliParseResult {
  const options: CliOptions = { json: false, file: DEFAULT_DOCUMENT_PATH };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--check") {
      continue;
    } else if (arg === "--file") {
      const next = argv[index + 1];
      if (!next) return { ok: false, error: "--file requires a path" };
      options.file = next;
      index += 1;
    } else if (arg.startsWith("--file=")) {
      const value = arg.slice("--file=".length);
      if (!value) return { ok: false, error: "--file requires a path" };
      options.file = value;
    } else {
      return { ok: false, error: `Unknown argument: ${arg}` };
    }
  }

  return { ok: true, options };
}

export interface CliDependencies {
  readFile?: (path: string) => string;
  now?: () => Date;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const USAGE = `Usage: bun run scripts/security/check-external-validation.ts [--check] [--json] [--file=<path>]`;

/**
 * CLI entry point. Returns the process exit code so tests can call it without
 * spawning a child process.
 */
export function runCli(argv: readonly string[], deps: CliDependencies = {}): number {
  const write = deps.stdout ?? ((line: string) => console.log(line));
  const writeError = deps.stderr ?? ((line: string) => console.error(line));
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const now = deps.now ? deps.now() : new Date();

  if (argv.includes("--help") || argv.includes("-h")) {
    write(USAGE);
    return 0;
  }

  const parsedArgs = parseCliArgs(argv);
  if (!parsedArgs.ok) {
    writeError(`✖ ${parsedArgs.error}`);
    writeError(USAGE);
    return 2;
  }

  const { file } = parsedArgs.options;
  const source = file === DEFAULT_DOCUMENT_PATH ? DEFAULT_DOCUMENT_SOURCE : file;
  const resolvedPath = isAbsolute(file) ? file : resolve(process.cwd(), file);

  let text: string;
  try {
    text = readFile(resolvedPath);
  } catch (err) {
    writeError(`✖ Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    writeError(`✖ ${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const parsed = parseExternalValidation(raw);
  if (!parsed.success) {
    writeError(`✖ ${file} failed schema validation:`);
    for (const issue of parsed.issues) {
      writeError(`  • ${issue}`);
    }
    return 1;
  }

  const evaluation = evaluateExternalValidation(parsed.document, now);

  if (parsedArgs.options.json) {
    write(JSON.stringify(buildJsonReport(parsed.document, evaluation, { now, source }), null, 2));
  } else {
    write(renderStatusTable(parsed.document, evaluation, now, source));
  }

  return evaluation.ok ? 0 : 1;
}

function main(): number {
  return runCli(process.argv.slice(2));
}

const entry = process.argv[1];
const invokedDirectly =
  Boolean(entry) &&
  (() => {
    try {
      return pathToFileURL(entry).href === import.meta.url;
    } catch {
      return false;
    }
  })();

if (invokedDirectly) {
  process.exit(main());
}
