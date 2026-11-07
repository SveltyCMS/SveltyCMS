import { describe, test, expect, vi, beforeEach } from "vitest";

// Dynamic import after suppressing module-level main() call
(globalThis as any).__TEST_SMART_IMPORT = true;
const mod = await import("../../../scripts/test/test-smart.ts");
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

describe("mapChangedFileToIntegrationPaths", () => {
  test("narrows media changes to media integration contracts + share-password route test", async () => {
    const { mapChangedFileToIntegrationPaths } =
      await import("../../../scripts/runs/run-integration.ts");
    const paths = mapChangedFileToIntegrationPaths("src/utils/media/sharing.ts");
    expect(paths).toContain("tests/integration/routes/share-password.test.ts");
    expect(paths).toContain("tests/integration/api/media.test.ts");
    expect(paths).not.toContain("tests/integration/databases/");
    expect(paths).not.toContain("tests/integration/api/");
  });

  test("narrows adapter-specific changes to that adapter and core parity contracts", async () => {
    const { mapChangedFileToIntegrationPaths } =
      await import("../../../scripts/runs/run-integration.ts");
    const paths = mapChangedFileToIntegrationPaths("src/databases/sqlite/modules/crud.ts");
    expect(paths).toEqual([
      "tests/integration/databases/sqlite-adapter.test.ts",
      "tests/integration/databases/contract.test.ts",
      "tests/integration/databases/adapter-parity.test.ts",
    ]);
  });

  test("widens harness changes to the full integration suite", async () => {
    const { mapChangedFileToIntegrationPaths } =
      await import("../../../scripts/runs/run-integration.ts");
    expect(mapChangedFileToIntegrationPaths("scripts/runs/integration-harness.ts")).toEqual([
      "tests/integration/",
    ]);
  });
});

describe("mutate-core diff filtering & target listing", () => {
  test("filters mutations by changed target file or mapped unit test", async () => {
    const { filterChangedMutations, listTargetFiles, MUTATIONS, SECURITY_TARGETS } =
      await import("../../../scripts/test/mutate-core.ts");
    const pool = [...MUTATIONS, ...SECURITY_TARGETS];
    const targets = listTargetFiles(pool);
    expect(targets.length).toBeGreaterThan(5);

    const sample = pool[0];
    const bySource = filterChangedMutations(pool, new Set([sample.file]));
    expect(bySource.some((m) => m.id === sample.id)).toBe(true);

    const byTest = filterChangedMutations(pool, new Set([sample.tests[0]]));
    expect(byTest.some((m) => m.id === sample.id)).toBe(true);

    const unrelated = filterChangedMutations(pool, new Set(["docs/README.md"]));
    expect(unrelated).toEqual([]);
  });
});
