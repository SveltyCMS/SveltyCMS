/**
 * @file tests/unit/scripts/check-flake-trend.test.ts
 * @description Pins the rolling flake-trend gate.
 *
 * The gate exists so one retry in a 29-test shard is absorbed by the window
 * while a recurring flake still fails. These fixtures cover the parsing rules
 * (stats and suite walk), the window boundary, and the strict "above budget
 * fails" comparison — a rate exactly at budget must pass.
 */

import { describe, expect, it } from "vitest";
import {
  entriesInWindow,
  evaluateTrend,
  parseHistoryContent,
  parsePlaywrightReport,
  summariseWindow,
  type HistoryEntry,
  type WindowStats,
} from "../../../scripts/check/check-flake-trend";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-13T00:00:00.000Z");

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    at: new Date(NOW).toISOString(),
    label: "E2E — shard 1",
    executed: 25,
    flaky: 0,
    failed: 0,
    ...overrides,
  };
}

function windowStats(overrides: Partial<WindowStats> = {}): WindowStats {
  return { runs: 1, executed: 100, failed: 0, flaky: 0, rate: 0, ...overrides };
}

describe("parsePlaywrightReport", () => {
  it("reads Playwright stats when present", () => {
    const raw = JSON.stringify({
      stats: { expected: 10, unexpected: 1, flaky: 2, skipped: 3 },
      suites: [{ specs: [{ tests: [{ results: [{ status: "failed" }] }] }] }],
    });

    expect(parsePlaywrightReport(raw)).toEqual({
      passed: 10,
      failed: 1,
      flaky: 2,
      skipped: 3,
    });
  });

  it("tolerates a UTF-8 BOM", () => {
    const raw = `\uFEFF${JSON.stringify({ stats: { expected: 4 } })}`;

    expect(parsePlaywrightReport(raw)).toEqual({ passed: 4, failed: 0, flaky: 0, skipped: 0 });
  });

  it("walks suites when stats is absent", () => {
    const raw = JSON.stringify({
      suites: [
        {
          specs: [
            // retried pass → flaky
            { tests: [{ results: [{ status: "failed" }, { status: "passed" }] }] },
            { tests: [{ results: [{ status: "passed" }] }] },
            { tests: [{ results: [{ status: "failed" }] }] },
            { tests: [{ status: "skipped", results: [] }] },
          ],
        },
        {
          suites: [
            {
              specs: [
                // timeout then pass → flaky
                { tests: [{ results: [{ status: "timedOut" }, { status: "passed" }] }] },
              ],
            },
          ],
        },
      ],
    });

    expect(parsePlaywrightReport(raw)).toEqual({
      passed: 1,
      failed: 1,
      flaky: 2,
      skipped: 1,
    });
  });

  it("treats a non-object report as empty", () => {
    expect(parsePlaywrightReport("[]")).toEqual({
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
    });
  });
});

describe("parseHistoryContent", () => {
  it("keeps valid lines and counts corrupt ones", () => {
    const raw = [
      JSON.stringify(entry({ label: "first" })),
      "",
      "not json",
      JSON.stringify({ at: "not-a-date", executed: 1, flaky: 0, failed: 0 }),
      JSON.stringify({ at: "2026-11-12T00:00:00.000Z", executed: "25", flaky: 0, failed: 0 }),
      JSON.stringify({
        at: "2026-11-12T01:00:00.000Z",
        executed: 25,
        flaky: 1,
        failed: 0,
      }),
    ].join("\n");

    const { entries, malformed } = parseHistoryContent(raw);

    expect(malformed).toBe(3);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({
      at: "2026-11-12T01:00:00.000Z",
      label: "unknown",
      executed: 25,
      flaky: 1,
      failed: 0,
    });
  });

  it("strips a leading BOM before parsing the first line", () => {
    const raw = `\uFEFF${JSON.stringify(entry())}`;

    expect(parseHistoryContent(raw).malformed).toBe(0);
  });

  it("returns nothing for an empty file", () => {
    expect(parseHistoryContent("")).toEqual({ entries: [], malformed: 0 });
  });
});

describe("entriesInWindow", () => {
  it("includes an entry exactly at the cutoff and excludes older ones", () => {
    const atCutoff = entry({ at: new Date(NOW - 7 * DAY_MS).toISOString(), label: "cutoff" });
    const tooOld = entry({ at: new Date(NOW - 7 * DAY_MS - 1).toISOString(), label: "old" });
    const fresh = entry({ at: new Date(NOW - DAY_MS).toISOString(), label: "fresh" });

    const windowed = entriesInWindow([fresh, tooOld, atCutoff], NOW, 7);

    expect(windowed.map((item) => item.label)).toEqual(["cutoff", "fresh"]);
  });

  it("sorts the window oldest first regardless of append order", () => {
    const third = entry({ at: new Date(NOW - DAY_MS).toISOString(), label: "third" });
    const first = entry({ at: new Date(NOW - 3 * DAY_MS).toISOString(), label: "first" });
    const second = entry({ at: new Date(NOW - 2 * DAY_MS).toISOString(), label: "second" });

    const windowed = entriesInWindow([third, first, second], NOW, 7);

    expect(windowed.map((item) => item.label)).toEqual(["first", "second", "third"]);
  });

  it("returns an empty window when every run is older", () => {
    const old = entry({ at: new Date(NOW - 30 * DAY_MS).toISOString() });

    expect(entriesInWindow([old], NOW, 7)).toEqual([]);
  });
});

describe("summariseWindow", () => {
  it("sums runs, executed, flaky and failed, and derives the rate", () => {
    const summary = summariseWindow([
      entry({ executed: 100, flaky: 1, failed: 2 }),
      entry({ executed: 100, flaky: 2, failed: 0 }),
    ]);

    expect(summary).toEqual({ runs: 2, executed: 200, failed: 2, flaky: 3, rate: 1.5 });
  });

  it("reports a zero rate for an empty window instead of NaN", () => {
    expect(summariseWindow([])).toEqual({ runs: 0, executed: 0, failed: 0, flaky: 0, rate: 0 });
  });
});

describe("evaluateTrend", () => {
  const budget = { maxFlaky: 2, maxRate: 1 };

  it("passes an empty window", () => {
    expect(evaluateTrend(windowStats(), budget)).toEqual({ ok: true, reasons: [] });
  });

  it("passes when flaky count and rate are exactly at budget", () => {
    const verdict = evaluateTrend(windowStats({ flaky: 2, rate: 1 }), budget);

    expect(verdict.ok).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("fails on the absolute flaky budget", () => {
    const verdict = evaluateTrend(windowStats({ flaky: 3, rate: 0.5 }), budget);

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["flaky 3 > budget 2"]);
  });

  it("fails on the rolling rate and formats it to two decimals", () => {
    const verdict = evaluateTrend(windowStats({ flaky: 2, rate: 1.234 }), budget);

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["flake rate 1.23% > budget 1%"]);
  });

  it("reports both reasons when both budgets are exceeded", () => {
    const verdict = evaluateTrend(windowStats({ flaky: 4, rate: 4 }), budget);

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["flaky 4 > budget 2", "flake rate 4.00% > budget 1%"]);
  });

  it("fails any flake when the budget is zero", () => {
    const verdict = evaluateTrend(windowStats({ flaky: 1, rate: 0.33 }), {
      maxFlaky: 0,
      maxRate: 100,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(["flaky 1 > budget 0"]);
  });
});
