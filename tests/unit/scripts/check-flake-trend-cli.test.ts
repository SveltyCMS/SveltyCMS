/**
 * @file tests/unit/scripts/check-flake-trend-cli.test.ts
 * @description CLI contract of the rolling flake gate (`check-flake-trend.ts`).
 *
 * `check-flake-trend.test.ts` pins the pure cores; this file pins what the CI job
 * actually invokes: flag parsing, `--baseline` / `--no-baseline`, the exit codes
 * of `--check`, the fail-closed empty window, the `--allow-missing` interaction,
 * the table shape and the `GITHUB_STEP_SUMMARY` body. A gate whose exit code
 * drifts is worthless even when its maths is right.
 *
 * The run happens in-process (`main(argv, io, env)`) because a child spawned from
 * the vitest worker returns no captured output — the process boundary itself is
 * covered by the CI job that runs this script for real.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { main, type TrendIo } from "../../../scripts/check/check-flake-trend";

const DAY_MS = 86_400_000;

interface Capture extends TrendIo {
  logged: string[];
  errored: string[];
  warned: string[];
}

function capture(): Capture {
  const logged: string[] = [];
  const errored: string[] = [];
  const warned: string[] = [];

  return {
    logged,
    errored,
    warned,
    log: (line) => logged.push(line),
    error: (line) => errored.push(line),
    warn: (line) => warned.push(line),
  };
}

function output(io: Capture): string {
  return [...io.logged, ...io.errored, ...io.warned].join("\n");
}

function workdir(): string {
  return mkdtempSync(join(tmpdir(), "flake-trend-cli-"));
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface Line {
  at: string;
  label: string;
  executed: number;
  flaky: number;
  failed: number;
  sha?: string;
}

function writeHistory(dir: string, lines: Line[]): string {
  const path = join(dir, ".flake-history.jsonl");
  writeFileSync(path, lines.map((line) => `${JSON.stringify(line)}\n`).join(""), "utf8");
  return path;
}

function writeBaseline(dir: string, baseline: unknown): string {
  const path = join(dir, ".flake-baseline.json");
  writeFileSync(path, typeof baseline === "string" ? baseline : JSON.stringify(baseline), "utf8");
  return path;
}

/** Five flakes over five nightly runs — the shape the real window had. */
function flakyHistory(): Line[] {
  // Ages stay well inside the 7-day window: an entry at exactly `now - 7 days`
  // flips in and out with the clock, which made this fixture pass locally and
  // fail in CI by one run.
  return [6, 5, 4, 3, 2].map((age) => ({
    at: daysAgo(age),
    label: "nightly probe",
    executed: 270,
    flaky: 1,
    failed: 6,
  }));
}

/** The same window plus one clean probe twelve hours ago. */
function flakyHistoryPlusClean(): Line[] {
  return [
    ...flakyHistory(),
    { at: daysAgo(0.5), label: "nightly probe", executed: 330, flaky: 0, failed: 0 },
  ];
}

const BUDGET = ["--window-days=7", "--max-rate=1", "--max-flaky=2"];

describe("check-flake-trend CLI", () => {
  it("fails the gate on the rolling count and names the budget", () => {
    const dir = workdir();
    const history = writeHistory(dir, flakyHistory());
    const io = capture();

    const code = main(["--check", ...BUDGET, `--history=${history}`, "--no-baseline"], io, {});

    expect(code).toBe(1);
    expect(output(io)).toContain("flaky 5 > budget 2");
    expect(output(io)).toContain("::error title=Flake trend::");
  });

  it("passes with a baseline that starts after those runs", () => {
    const dir = workdir();
    const history = writeHistory(dir, flakyHistoryPlusClean());
    const baseline = writeBaseline(dir, {
      at: daysAgo(1),
      sha: "579ce8b07e61318a9933ac53faa2c0bb77bd50b3",
      reason: "test baseline",
    });
    const io = capture();

    const code = main(
      ["--check", ...BUDGET, `--history=${history}`, `--baseline=${baseline}`],
      io,
      {},
    );

    expect(code).toBe(0);
    expect(output(io)).toContain("Baseline:");
    expect(output(io)).toContain("within budget");
  });

  it("keeps the runs the baseline leaves inside the window", () => {
    const dir = workdir();
    const history = writeHistory(dir, flakyHistoryPlusClean());
    const baseline = writeBaseline(dir, { at: daysAgo(1), reason: "after the fix wave" });
    const io = capture();

    main(["--check", ...BUDGET, `--history=${history}`, `--baseline=${baseline}`], io, {});

    // one run kept, 330 executed, zero flakes: the window is not empty
    expect(output(io)).toContain("1 run · 330 executed · 0 flaky");
    // the five nightly runs inside the window were removed by the marker
    expect(output(io)).toContain("5 earlier runs excluded");
  });

  it("fails closed when a gated window holds no run", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);
    const io = capture();

    expect(main(["--check", ...BUDGET, `--history=${history}`], io, {})).toBe(1);
    expect(output(io)).toContain("a gate without data is not a pass");
  });

  it("stays green in report-only mode on an empty window", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);

    expect(main([...BUDGET, `--history=${history}`], capture(), {})).toBe(0);
  });

  it("names a missing report instead of claiming an empty window", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);
    const io = capture();

    const code = main(
      [
        "--check",
        "--allow-missing",
        `--append=${join(dir, "no-report.json")}`,
        ...BUDGET,
        `--history=${history}`,
      ],
      io,
      {},
    );

    expect(code).toBe(1);
    expect(output(io)).toContain("no report and no history");
  });

  it("falls back to the full history when the baseline is corrupt", () => {
    const dir = workdir();
    const history = writeHistory(dir, flakyHistory());
    const baseline = writeBaseline(dir, "not json");
    const io = capture();

    expect(
      main(["--check", ...BUDGET, `--history=${history}`, `--baseline=${baseline}`], io, {}),
    ).toBe(1);
    expect(output(io)).toContain("ignoring unparseable baseline");
    expect(output(io)).toContain("flaky 5 > budget 2");
  });

  it("warns when the baseline carries no sha or reason", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);
    const baseline = writeBaseline(dir, { at: daysAgo(1) });
    const io = capture();

    main(["--check", ...BUDGET, `--history=${history}`, `--baseline=${baseline}`], io, {});

    expect(output(io)).toContain("has no sha");
    expect(output(io)).toContain("has no reason");
  });

  it("writes the sha into the history line and into the summary table", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);
    const report = join(dir, "playwright-results.json");
    const summary = join(dir, "summary.md");
    writeFileSync(
      report,
      JSON.stringify({ stats: { expected: 330, unexpected: 0, flaky: 0, skipped: 39 } }),
      "utf8",
    );
    const io = capture();

    const code = main(
      [
        `--append=${report}`,
        "--label=nightly probe",
        "--sha=579ce8b07e61318a9933ac53faa2c0bb77bd50b3",
        ...BUDGET,
        `--history=${history}`,
      ],
      io,
      { GITHUB_STEP_SUMMARY: summary },
    );

    expect(code).toBe(0);
    expect(output(io)).toContain("579ce8b07");
    expect(JSON.parse(readFileSync(history, "utf8").trim())).toMatchObject({
      sha: "579ce8b07e61318a9933ac53faa2c0bb77bd50b3",
      executed: 330,
      flaky: 0,
    });
    expect(readFileSync(summary, "utf8")).toContain("| Sha |");
  });

  it("escapes a non-hex sha so the Markdown row keeps seven columns", () => {
    const dir = workdir();
    const history = writeHistory(dir, []);
    const report = join(dir, "playwright-results.json");
    const summary = join(dir, "summary.md");
    writeFileSync(report, JSON.stringify({ stats: { expected: 4, unexpected: 0 } }), "utf8");

    main(
      [`--append=${report}`, "--label=lab|el", "--sha=a|b0", ...BUDGET, `--history=${history}`],
      capture(),
      {},
    );
    main([...BUDGET, `--history=${history}`], capture(), { GITHUB_STEP_SUMMARY: summary });

    const body = readFileSync(summary, "utf8");
    const lines = body.split("\n");
    const header = lines.find((line) => line.startsWith("| At"));
    const row = lines.find((line) => line.startsWith("| 2"));

    // an escaped pipe must not become a column: strip the escapes, then count
    const columns = (line: string | undefined): number =>
      (line ?? "").replaceAll("\\|", "").split("|").length;

    expect(columns(row)).toBe(columns(header));
    expect(columns(header)).toBe(9); // 7 cells + 2 edge pipes
    expect(body).toContain("a\\|b0");
  });
});
