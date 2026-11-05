#!/usr/bin/env bun
/**
 * @file scripts/security/check-threat-model-drift.ts
 * @description CLI for the threat-model drift gate. Every security surface in
 * `docs/security/threat-model.json` owns a set of paths. When one of those files
 * changes, its fingerprint no longer matches and CI fails until the surface's
 * MDX model is reviewed and the manifest is refreshed.
 *
 * Modes:
 * - `--check` (default)  table + coverage; exit 1 on drift, missing model,
 *                        uncovered server route or a review older than 12 months.
 * - `--update [--date]`  recompute fingerprints and write the manifest; exit 0.
 * - `--json`             machine-readable output for either mode.
 *
 * Exit codes: 0 pass, 1 gate failure, 2 usage/IO/schema failure.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  MANIFEST_PATH,
  evaluateManifest,
  fingerprintSurface,
  parseManifest,
  resolveSurfaceFiles,
  type Manifest,
  type ThreatModelEvaluation,
  type ThreatSurface,
} from "./threat-model-lib";

const EXIT_OK = 0;
const EXIT_GATE_FAILED = 1;
const EXIT_USAGE = 2;

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "CliError";
  }
}

interface CliOptions {
  mode: "check" | "update";
  json: boolean;
  date?: string;
}

function usage(): string {
  return [
    "Usage: bun run scripts/security/check-threat-model-drift.ts [--check | --update] [--date YYYY-MM-DD] [--json]",
    "",
    "  --check   Verify fingerprints, models, coverage and review age (default).",
    "  --update  Recompute fingerprints and write docs/security/threat-model.json.",
    "  --date    Review date recorded by --update (default: today, UTC).",
    "  --json    Print machine-readable JSON.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliOptions {
  let mode: CliOptions["mode"] = "check";
  let modeExplicit = false;
  let json = false;
  let date: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(EXIT_OK);
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--check" || arg === "--update") {
      const nextMode = arg === "--update" ? "update" : "check";
      if (modeExplicit && mode !== nextMode) {
        throw new CliError("--check and --update are mutually exclusive", EXIT_USAGE);
      }
      mode = nextMode;
      modeExplicit = true;
      continue;
    }
    if (arg === "--date" || arg.startsWith("--date=")) {
      const value = arg === "--date" ? argv[(index += 1)] : arg.slice("--date=".length);
      if (!value) throw new CliError("--date requires a YYYY-MM-DD value", EXIT_USAGE);
      date = value;
      continue;
    }
    throw new CliError(`Unknown argument: ${arg}\n\n${usage()}`, EXIT_USAGE);
  }

  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CliError(`Invalid --date "${date}" — expected YYYY-MM-DD`, EXIT_USAGE);
  }

  return { mode, json, date };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadManifest(cwd: string): Manifest {
  const absolute = resolve(cwd, MANIFEST_PATH);
  if (!existsSync(absolute)) {
    throw new CliError(
      `Manifest not found: ${MANIFEST_PATH} (run with --update after creating the file)`,
      EXIT_USAGE,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch (error) {
    throw new CliError(`Cannot read ${MANIFEST_PATH}: ${errorMessage(error)}`, EXIT_USAGE);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Invalid JSON in ${MANIFEST_PATH}: ${errorMessage(error)}`, EXIT_USAGE);
  }

  try {
    return parseManifest(parsed);
  } catch (error) {
    throw new CliError(`Invalid manifest ${MANIFEST_PATH}: ${errorMessage(error)}`, EXIT_USAGE);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SurfaceRow {
  id: string;
  files: number;
  reviewedAt: string;
  status: string;
}

function statusOf(
  surface: ThreatSurface,
  evaluation: ThreatModelEvaluation,
  modelExists: boolean,
): string {
  const parts: string[] = [];
  if (evaluation.drifted.includes(surface.id)) parts.push("drift");
  if (!modelExists || evaluation.missingModels.includes(surface.id)) parts.push("missing model");
  if (evaluation.stale.includes(surface.id)) parts.push("stale");
  return parts.length === 0 ? "ok" : parts.join(", ");
}

function printTable(rows: readonly SurfaceRow[]): void {
  const headers = { id: "Surface", files: "Files", reviewedAt: "Reviewed", status: "Status" };
  const idWidth = Math.max(headers.id.length, ...rows.map((row) => row.id.length));
  const filesWidth = Math.max(headers.files.length, ...rows.map((row) => String(row.files).length));
  const reviewedWidth = Math.max(
    headers.reviewedAt.length,
    ...rows.map((row) => row.reviewedAt.length),
  );

  console.log(
    `${headers.id.padEnd(idWidth)}  ${headers.files.padStart(filesWidth)}  ${headers.reviewedAt.padEnd(reviewedWidth)}  ${headers.status}`,
  );
  console.log(
    `${"-".repeat(idWidth)}  ${"-".repeat(filesWidth)}  ${"-".repeat(reviewedWidth)}  ${"-".repeat(10)}`,
  );
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(idWidth)}  ${String(row.files).padStart(filesWidth)}  ${row.reviewedAt.padEnd(reviewedWidth)}  ${row.status}`,
    );
  }
}

function printProblems(evaluation: ThreatModelEvaluation): void {
  if (evaluation.drifted.length > 0) {
    console.error(`\nDrifted surfaces (fingerprint changed): ${evaluation.drifted.join(", ")}`);
    console.error("  Review the matching MDX model, then run --update --date YYYY-MM-DD.");
  }
  if (evaluation.missingModels.length > 0) {
    console.error(`\nMissing threat models: ${evaluation.missingModels.join(", ")}`);
  }
  if (evaluation.uncovered.length > 0) {
    console.error(`\nUncovered server routes (${evaluation.uncovered.length}):`);
    for (const file of evaluation.uncovered) console.error(`  - ${file}`);
  }
  if (evaluation.stale.length > 0) {
    console.error(`\nReviews older than 12 months: ${evaluation.stale.join(", ")}`);
  }
}

function runCheck(cwd: string, json: boolean): number {
  const manifest = loadManifest(cwd);
  const evaluation = evaluateManifest(manifest, cwd);

  const surfaces = manifest.surfaces.map((surface) => {
    const files = resolveSurfaceFiles(surface, cwd);
    const modelExists = existsSync(resolve(cwd, surface.model));
    return {
      id: surface.id,
      files: files.length,
      reviewed_at: surface.reviewed_at,
      model: surface.model,
      modelExists,
      fingerprint: surface.fingerprint,
      fingerprintMatches: !evaluation.drifted.includes(surface.id),
      stale: evaluation.stale.includes(surface.id),
      status: statusOf(surface, evaluation, modelExists),
    };
  });

  const ok =
    evaluation.drifted.length === 0 &&
    evaluation.missingModels.length === 0 &&
    evaluation.uncovered.length === 0 &&
    evaluation.stale.length === 0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok,
          manifest: MANIFEST_PATH,
          coverage: evaluation.coverage,
          surfaces,
          failures: {
            drifted: evaluation.drifted,
            missingModels: evaluation.missingModels,
            uncovered: evaluation.uncovered,
            stale: evaluation.stale,
          },
        },
        null,
        2,
      ),
    );
    return ok ? EXIT_OK : EXIT_GATE_FAILED;
  }

  console.log("Threat-model drift check");
  console.log(`Manifest: ${MANIFEST_PATH} (${manifest.surfaces.length} surfaces)\n`);
  printTable(
    surfaces.map((surface) => ({
      id: surface.id,
      files: surface.files,
      reviewedAt: surface.reviewed_at,
      status: surface.status,
    })),
  );
  console.log(
    `\nCoverage: ${evaluation.coverage.covered}/${evaluation.coverage.total} route server files (${evaluation.coverage.percent.toFixed(1)}%)`,
  );

  if (ok) {
    console.log("\nPASS — no drift, every server route is covered, reviews are current.");
    return EXIT_OK;
  }

  printProblems(evaluation);
  console.error("\nFAIL — update the affected threat models before merging.");
  return EXIT_GATE_FAILED;
}

function runUpdate(cwd: string, date: string, json: boolean): number {
  const current = loadManifest(cwd);
  const emptySurfaces: string[] = [];
  const updatedSurfaces: ThreatSurface[] = current.surfaces.map((surface) => {
    const { files, fingerprint } = fingerprintSurface(surface, cwd);
    if (files.length === 0) emptySurfaces.push(`${surface.id} (${surface.paths.join(", ")})`);
    return { ...surface, fingerprint, reviewed_at: date };
  });

  if (emptySurfaces.length > 0) {
    throw new CliError(
      `Refusing to update — these surfaces match no files:\n  ${emptySurfaces.join("\n  ")}`,
      EXIT_USAGE,
    );
  }

  const candidate: Manifest = { version: 1, surfaces: updatedSurfaces };
  let manifest: Manifest;
  try {
    manifest = parseManifest(candidate);
  } catch (error) {
    throw new CliError(`Refusing to write an invalid manifest: ${errorMessage(error)}`, EXIT_USAGE);
  }

  const absolute = resolve(cwd, MANIFEST_PATH);
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new CliError(`Cannot write ${MANIFEST_PATH}: ${errorMessage(error)}`, EXIT_USAGE);
  }

  const evaluation = evaluateManifest(manifest, cwd, date);
  const rows: SurfaceRow[] = manifest.surfaces.map((surface) => ({
    id: surface.id,
    files: resolveSurfaceFiles(surface, cwd).length,
    reviewedAt: surface.reviewed_at,
    status: "updated",
  }));

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          manifest: MANIFEST_PATH,
          reviewedAt: date,
          coverage: evaluation.coverage,
          uncovered: evaluation.uncovered,
          surfaces: rows,
        },
        null,
        2,
      ),
    );
    return EXIT_OK;
  }

  console.log(`Threat-model manifest updated (${MANIFEST_PATH})\n`);
  printTable(rows);
  console.log(
    `\nCoverage: ${evaluation.coverage.covered}/${evaluation.coverage.total} route server files (${evaluation.coverage.percent.toFixed(1)}%)`,
  );
  if (evaluation.uncovered.length > 0) {
    console.warn(
      `\nWARNING — ${evaluation.uncovered.length} server route(s) are still uncovered. Add them to a surface before --check can pass.`,
    );
  }
  if (evaluation.missingModels.length > 0) {
    console.warn(`WARNING — missing threat models: ${evaluation.missingModels.join(", ")}`);
  }
  return EXIT_OK;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const exitCode =
    options.mode === "update"
      ? runUpdate(cwd, options.date ?? todayIso(), options.json)
      : runCheck(cwd, options.json);

  process.exit(exitCode);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      process.exit(error.exitCode);
    }
    console.error(`error: ${errorMessage(error)}`);
    process.exit(EXIT_USAGE);
  }
}
