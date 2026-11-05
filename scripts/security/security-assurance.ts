#!/usr/bin/env bun
/**
 * @file scripts/security/security-assurance.ts
 * @description
 * Single entry point for the security-assurance gates. Runs the four checks
 * that produce the evidence described in `docs/reference/security/security-case.mdx`
 * — advisory ledger + SLA, threat-model drift, test strength, external
 * validation — and exits non-zero if any of them fails.
 *
 * Each check is still an independent script (so it can be read and run alone);
 * this aggregator only decides *which* checks run and how their exit codes
 * combine. Keeping the child processes separate means one broken check cannot
 * take the others down, and `bun run <script>` on each remains the debugging
 * path.
 *
 * ### Features:
 * - One command for every assurance gate: `bun run security:assurance`
 * - `--only=<id>` runs a single check without leaving the aggregate
 * - `--require-mutation` fails when no mutation report exists (nightly job)
 * - `--json` emits a machine-readable summary and suppresses child output
 * - Bounded per-step timeout so a hung check cannot block the gate
 *
 * ### Usage
 *   bun run security:assurance
 *   bun run security:assurance --only=advisories
 *   bun run security:assurance --require-mutation --json
 *
 * Exit codes: 0 every selected check passed · 1 a check failed · 2 usage error.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const ASSURANCE_STEP_IDS = [
  "advisories",
  "threat-model",
  "test-strength",
  "external",
] as const;

export type AssuranceStepId = (typeof ASSURANCE_STEP_IDS)[number];

export interface AssuranceStep {
  id: AssuranceStepId;
  label: string;
  /** File name inside `scripts/security/`. */
  script: string;
  args: readonly string[];
}

export interface AssuranceArgs {
  only: AssuranceStepId | null;
  requireMutation: boolean;
  json: boolean;
  help: boolean;
}

export type AssuranceParseResult = { ok: true; args: AssuranceArgs } | { ok: false; error: string };

export interface StepResult {
  id: AssuranceStepId;
  label: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunnerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Executes one child script and returns its output. Injected by tests. */
export type StepRunner = (scriptPath: string, args: readonly string[]) => RunnerResult;

export interface AssuranceDependencies {
  run?: StepRunner;
  write?: (text: string) => void;
  writeError?: (text: string) => void;
}

const STEP_TIMEOUT_MS = 120_000;

const STEP_TEMPLATES: readonly AssuranceStep[] = [
  {
    id: "advisories",
    label: "Advisory ledger + release SLA",
    script: "check-advisories.ts",
    args: ["--fail-on-breach"],
  },
  {
    id: "threat-model",
    label: "Threat-model drift + route coverage",
    script: "check-threat-model-drift.ts",
    args: ["--check"],
  },
  {
    id: "test-strength",
    label: "Mutation-score floors",
    script: "check-test-strength.ts",
    args: ["--allow-missing"],
  },
  {
    id: "external",
    label: "External-validation evidence",
    script: "check-external-validation.ts",
    args: ["--check"],
  },
];

const USAGE = `Usage: bun run security:assurance [options]

Options:
  --only=<id>         Run one check: ${ASSURANCE_STEP_IDS.join(" | ")}
  --require-mutation  Fail when no mutation report exists (nightly job)
  --json              Machine-readable summary; child output is suppressed
  -h, --help          Show this message

Exit codes: 0 all selected checks passed · 1 a check failed · 2 usage error

The individual checks can still be run directly, e.g.
  bun run scripts/security/check-advisories.ts`;

/** Parse argv. A bad flag is a usage error, never a silent default. */
export function parseArgs(argv: readonly string[]): AssuranceParseResult {
  const args: AssuranceArgs = {
    only: null,
    requireMutation: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--require-mutation") {
      args.requireMutation = true;
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
    if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      if (!(ASSURANCE_STEP_IDS as readonly string[]).includes(value)) {
        return {
          ok: false,
          error: `Unknown check "${value}". Valid values: ${ASSURANCE_STEP_IDS.join(", ")}.`,
        };
      }
      args.only = value as AssuranceStepId;
      continue;
    }
    return { ok: false, error: `Unknown argument "${arg}".` };
  }

  return { ok: true, args };
}

/** The steps selected by the flags, in a fixed order. */
export function buildSteps(args: AssuranceArgs): AssuranceStep[] {
  const selected = args.only
    ? STEP_TEMPLATES.filter((step) => step.id === args.only)
    : [...STEP_TEMPLATES];

  return selected.map((step) => ({
    ...step,
    args:
      step.id === "test-strength" && args.requireMutation
        ? step.args.filter((arg) => arg !== "--allow-missing")
        : [...step.args],
  }));
}

/** `true` only when every selected step exited 0. */
export function allPassed(results: readonly StepResult[]): boolean {
  return results.every((result) => result.exitCode === 0);
}

function defaultRunner(scriptPath: string, args: readonly string[]): RunnerResult {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    timeout: STEP_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? (result.error ? 2 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function renderSummary(results: readonly StepResult[]): string {
  const width = Math.max(...results.map((result) => result.id.length));
  const lines = results.map(
    (result) => `  ${result.id.padEnd(width)}  ${result.exitCode === 0 ? "PASS" : "FAIL"}`,
  );
  const passed = results.filter((result) => result.exitCode === 0).length;
  const verdict = allPassed(results)
    ? `✔ ${passed}/${results.length} checks passed`
    : `✖ ${results.length - passed}/${results.length} check(s) failed`;
  return [...lines, "", verdict].join("\n");
}

/**
 * Run the selected checks. Returns the process exit code so tests can call it
 * without exiting.
 */
export function runAssurance(
  argv: readonly string[],
  dependencies: AssuranceDependencies = {},
): number {
  const run = dependencies.run ?? defaultRunner;
  const write = dependencies.write ?? ((text: string) => console.log(text));
  const writeError = dependencies.writeError ?? ((text: string) => console.error(text));

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    writeError(`✖ ${parsed.error}`);
    writeError(USAGE);
    return 2;
  }

  if (parsed.args.help) {
    write(USAGE);
    return 0;
  }

  const steps = buildSteps(parsed.args);
  const results: StepResult[] = [];

  if (!parsed.args.json) {
    write(`Security assurance (${steps.length} check${steps.length === 1 ? "" : "s"})`);
  }

  for (const step of steps) {
    const scriptPath = join(import.meta.dirname, step.script);
    const outcome = run(scriptPath, step.args);
    const result: StepResult = {
      id: step.id,
      label: step.label,
      exitCode: outcome.status ?? 2,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
    };
    results.push(result);

    if (parsed.args.json) continue;

    write(`\n▶ ${step.label}`);
    if (outcome.stdout.trim()) write(outcome.stdout.trimEnd());
    if (outcome.stderr.trim()) writeError(outcome.stderr.trimEnd());
  }

  if (parsed.args.json) {
    write(
      JSON.stringify(
        {
          ok: allPassed(results),
          steps: results.map((result) => ({
            id: result.id,
            label: result.label,
            exitCode: result.exitCode,
            status: result.exitCode === 0 ? "pass" : "fail",
          })),
        },
        null,
        2,
      ),
    );
  } else {
    write(`\n${renderSummary(results)}`);
  }

  return allPassed(results) ? 0 : 1;
}

function main(): number {
  return runAssurance(process.argv.slice(2));
}

if (import.meta.main) {
  process.exit(main());
}
