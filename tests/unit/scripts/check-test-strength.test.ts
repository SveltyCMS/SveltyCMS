/**
 * @file tests/unit/scripts/check-test-strength.test.ts
 * @description Pins the mutation-score arithmetic and the gate's exit contract.
 *
 * The fixtures are real report documents (same shape `mutate-core.ts` writes).
 * The blocking fixture is deliberately mixed:
 * - auth aggregates 3 killed / 1 survived → 75 % (floor 60)
 * - security aggregates two files → 80 % (floor 65) even though
 *   `safe-redirect.ts` is only 50 % on its own — the area is the gate, the file
 *   row is diagnostic
 * - `invalid` and `aborted` mutations never enter the denominator
 * - write-pipeline has 0 killed / 1 survived → 0 % (floor 55)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  evaluateStrength,
  formatTable,
  isFloorsFile,
  mutationScore,
  normalizePath,
  parseArgs,
  parseReport,
  resolveFloor,
  runCheck,
  type FloorsFile,
} from "../../../scripts/security/check-test-strength";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(fixture(name), "utf8"));
}

const floors = readJson("floors.json") as FloorsFile;
const blockingReport = parseReport(readJson("mutation-report-blocking.json"));
const passingReport = parseReport(readJson("mutation-report-passing.json"));

describe("mutation score arithmetic", () => {
  it("scores killed / (killed + survived)", () => {
    expect(mutationScore(3, 1)).toBe(75);
    expect(mutationScore(4, 0)).toBe(100);
    expect(mutationScore(0, 4)).toBe(0);
  });

  it("rounds to one decimal", () => {
    expect(mutationScore(2, 1)).toBe(66.7);
    expect(mutationScore(1, 2)).toBe(33.3);
  });

  it("returns null when nothing was executable", () => {
    expect(mutationScore(0, 0)).toBeNull();
  });
});

describe("floor resolution", () => {
  it("uses the longest matching prefix", () => {
    expect(resolveFloor("src/utils/security/input-sanitizer.ts", floors).floor).toBe(65);
    expect(resolveFloor("src/utils/anything.ts", floors).floor).toBe(40);
  });

  it("prefers a file floor over its directory floor", () => {
    const resolved = resolveFloor("src/utils/egress-guard.ts", floors);
    expect(resolved).toEqual({ area: "src/utils/egress-guard.ts", floor: 65 });
  });

  it("falls back to the default floor outside every configured area", () => {
    const resolved = resolveFloor("src/unknown/file.ts", floors);
    expect(resolved.floor).toBe(55);
    expect(resolved.area).toBe("(default)");
  });

  it("normalises Windows separators", () => {
    expect(normalizePath(".\\src\\utils\\security\\x.ts")).toBe("src/utils/security/x.ts");
  });
});

describe("per-area aggregation", () => {
  const evaluation = evaluateStrength(blockingReport, floors);

  it("sums every file in an area and ignores invalid/aborted mutations", () => {
    const security = evaluation.areas.find((area) => area.area === "src/utils/security/");
    expect(security).toBeDefined();
    expect(security?.killed).toBe(4);
    expect(security?.survived).toBe(1);
    expect(security?.invalid).toBe(1);
    expect(security?.score).toBe(80);
    expect(security?.ok).toBe(true);
  });

  it("keeps the file score diagnostic even when its area passes", () => {
    const file = evaluation.files.find((row) => row.file.endsWith("safe-redirect.ts"));
    expect(file?.score).toBe(50);
  });

  it("does not count aborted mutations against egress", () => {
    const egress = evaluation.areas.find((area) => area.area === "src/utils/egress-guard.ts");
    expect(egress?.aborted).toBe(1);
    expect(egress?.score).toBe(100);
    expect(egress?.ok).toBe(true);
  });

  it("reports configured areas with no data as no-data, not as a breach", () => {
    const unreported = evaluation.areas.find((area) => area.area === "src/unreported/");
    expect(unreported?.score).toBeNull();
    expect(unreported?.ok).toBe(true);
  });

  it("fails the evaluation when any area is below its floor", () => {
    const writePipeline = evaluation.areas.find(
      (area) => area.area === "src/services/sdk/namespaces/collections/write-pipeline.ts",
    );
    expect(writePipeline?.score).toBe(0);
    expect(writePipeline?.ok).toBe(false);
    expect(evaluation.ok).toBe(false);
  });

  it("passes when every scored area is at or above its floor", () => {
    expect(evaluateStrength(passingReport, floors).ok).toBe(true);
  });

  it("renders the area table", () => {
    const table = formatTable(evaluation);
    expect(table).toContain("== Mutation score vs floors ==");
    expect(table).toContain("src/databases/auth/");
    expect(table).toContain("FAIL");
  });
});

describe("runCheck exit contract", () => {
  it("exits 1 and names the breached area", () => {
    const result = runCheck({
      reportPath: fixture("mutation-report-blocking.json"),
      floorsPath: fixture("floors.json"),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("below floor");
    expect(result.stdout).toContain("write-pipeline.ts");
  });

  it("exits 0 when every area passes", () => {
    const result = runCheck({
      reportPath: fixture("mutation-report-passing.json"),
      floorsPath: fixture("floors.json"),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("at or above its floor");
  });

  it("exits 2 when the report is missing", () => {
    const result = runCheck({
      reportPath: fixture("does-not-exist.json"),
      floorsPath: fixture("floors.json"),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("No mutation report");
    expect(result.stderr).toContain("bun run test:mutation:security");
  });

  it("exits 0 with a notice when the report is missing and --allow-missing is set", () => {
    const result = runCheck({
      reportPath: fixture("does-not-exist.json"),
      floorsPath: fixture("floors.json"),
      allowMissing: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No mutation report");
    expect(result.stdout).toContain("bun run test:mutation:security");
  });

  it("exits 2 on a malformed report instead of scoring it as empty", () => {
    const result = runCheck({
      reportPath: fixture("mutation-report-malformed.json"),
      floorsPath: fixture("floors.json"),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown status");
  });

  it("emits JSON with the same verdict in --json mode", () => {
    const result = runCheck({
      reportPath: fixture("mutation-report-passing.json"),
      floorsPath: fixture("floors.json"),
      json: true,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      areas: { area: string; score: number | null }[];
      files: unknown[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.areas.map((area) => area.area)).toContain("src/databases/auth/");
    expect(parsed.files.length).toBeGreaterThan(0);
  });
});

describe("argument and file validation", () => {
  it("parses the supported flags", () => {
    expect(parseArgs([])).toMatchObject({
      reportPath: ".mutation/report.json",
      allowMissing: false,
      json: false,
      help: false,
    });
    expect(
      parseArgs(["--report=out.json", "--floors=f.json", "--json", "--allow-missing"]),
    ).toMatchObject({
      reportPath: "out.json",
      floorsPath: "f.json",
      json: true,
      allowMissing: true,
    });
    expect(parseArgs(["--report", "out.json", "--floors", "f.json"])).toMatchObject({
      reportPath: "out.json",
      floorsPath: "f.json",
    });
  });

  it("rejects a flag whose path is missing", () => {
    expect(() => parseArgs(["--report"])).toThrow(/needs a path/);
    expect(() => parseArgs(["--report=", "--json"])).toThrow(/needs a non-empty path/);
  });

  it("rejects unknown arguments", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });

  it("validates the floors envelope", () => {
    expect(isFloorsFile({ version: 1, default: 55, floors: { "src/x/": 60 } })).toBe(true);
    expect(isFloorsFile({ version: 1, default: "55", floors: {} })).toBe(false);
    expect(isFloorsFile({ version: 1, default: 55, floors: { "src/x/": "high" } })).toBe(false);
  });
});
