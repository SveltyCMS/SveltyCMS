import { describe, test, expect, vi, beforeEach } from "vitest";

// Dynamic import after suppressing module-level main() call
(globalThis as any).__TEST_SMART_IMPORT = true;
const mod = await import("../../../scripts/test-smart.ts");
const { expandSyntheticEdges } = mod;

describe("dedupeContainedSuites", () => {
  const { dedupeContainedSuites } = mod;

  const suite = (gate: number, command: string, label = command) => ({
    rule: { patterns: [], command, label, gate },
    matchingFiles: [],
  });

  const DIR = "tests/unit";
  const NARROW = "tests/unit/utils";
  const FILE = "tests/unit/utils/cn.test.ts";

  test("drops a suite already covered by a broader scope at the same gate", () => {
    const suites = [suite(1, `bun x vitest run ${DIR}`), suite(1, `bun x vitest run ${NARROW}/`)];
    const { kept, skipped } = dedupeContainedSuites(suites, process.cwd());

    expect(kept.map((s: { rule: { label: string } }) => s.rule.label)).toEqual([
      `bun x vitest run ${DIR}`,
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].containerScope).toBe(`${DIR}/`);
  });

  test("keeps every suite when a container is itself dropped (coverage is never lost)", () => {
    const suites = [
      suite(1, `bun x vitest run ${DIR}`),
      suite(1, `bun x vitest run ${NARROW}/`),
      suite(1, `bun x vitest run ${FILE}`),
    ];
    const { kept, skipped } = dedupeContainedSuites(suites, process.cwd());

    expect(kept).toHaveLength(1);
    expect(skipped).toHaveLength(2);
    // Every skipped suite must resolve to the surviving ancestor, not to a dropped one.
    for (const entry of skipped) expect(entry.containerScope).toBe(`${DIR}/`);
  });

  test("keeps a fail-closed plan untouched", () => {
    const suites = [
      suite(0, "bun x vitest run tests/unit"),
      suite(0, "bun x vitest run tests/unit/utils/"),
    ];
    const { kept, skipped } = dedupeContainedSuites(suites, process.cwd());

    expect(kept).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  test("never dedupes across gates", () => {
    const suites = [suite(1, `bun x vitest run ${DIR}`), suite(2, `bun x vitest run ${NARROW}/`)];
    expect(dedupeContainedSuites(suites, process.cwd()).skipped).toEqual([]);
  });

  test("never dedupes sibling scopes", () => {
    const suites = [
      suite(1, "bun x vitest run tests/unit/utils/"),
      suite(1, "bun x vitest run tests/unit/widgets/"),
    ];
    expect(dedupeContainedSuites(suites, process.cwd()).skipped).toEqual([]);
  });

  test("never dedupes a name-filtered run", () => {
    const suites = [
      suite(1, `bun x vitest run ${DIR}`),
      suite(1, `bun x vitest run ${NARROW}/ -t "cn"`),
    ];
    expect(dedupeContainedSuites(suites, process.cwd()).skipped).toEqual([]);
  });

  test("never dedupes non-Vitest runners, env-prefixed or compound commands", () => {
    const suites = [
      suite(1, `bun x vitest run ${DIR}`),
      suite(1, `bun test ${FILE}`),
      suite(1, `DB_TYPE=postgresql bun x vitest run ${NARROW}/`),
      suite(1, `bun x vitest run ${NARROW}/ && echo done`),
    ];
    const { kept, skipped } = dedupeContainedSuites(suites, process.cwd());

    expect(kept).toHaveLength(4);
    expect(skipped).toEqual([]);
  });

  test("never dedupes a scope that does not resolve on disk", () => {
    const suites = [
      suite(1, `bun x vitest run ${DIR}`),
      suite(1, "bun x vitest run tests/unit/__nope__/"),
    ];
    expect(dedupeContainedSuites(suites, process.cwd()).skipped).toEqual([]);
  });

  test("equal scopes keep the first in plan order", () => {
    const suites = [
      suite(1, `bun x vitest run ${NARROW}/`),
      suite(1, `bun x vitest run ${NARROW}/`),
    ];
    const { kept, skipped } = dedupeContainedSuites(suites, process.cwd());

    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(suites[0]);
    expect(skipped).toHaveLength(1);
  });

  test("does not mutate the caller's plan", () => {
    const suites = [suite(1, `bun x vitest run ${DIR}`), suite(1, `bun x vitest run ${NARROW}/`)];
    dedupeContainedSuites(suites, process.cwd());
    expect(suites).toHaveLength(2);
  });
});

describe("expandSyntheticEdges", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("collection schema change pulls in generated types", () => {
    const result = expandSyntheticEdges(["config/collections/BlogPost.ts"]);
    expect(result).toContain("src/content/types.generated.ts");
    expect(result).toContain("src/content/types.ts");
  });

  test("leaves unrelated changes untouched", () => {
    const result = expandSyntheticEdges(["src/utils/slugify.ts"]);
    expect(result).toEqual(["src/utils/slugify.ts"]);
  });
});
