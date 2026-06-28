/**
 * @vitest-environment node
 * @file tests/unit/plugins/smart-importer-advanced.test.ts
 * @description Tests for advanced features v2.1: stubbing, JSONPath, schema diff, media harvest, cycles, DB streaming.
 */
import { describe, it, expect } from "vitest";

describe("Advanced Features", () => {
  it("resolves deep JSONPath with dot notation", async () => {
    const { resolveDeepJsonPath } = await import("@plugins/smart-importer/advanced-features");
    expect(resolveDeepJsonPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("resolves deep JSONPath with bracket notation", async () => {
    const { resolveDeepJsonPath } = await import("@plugins/smart-importer/advanced-features");
    const obj = { items: [{ name: "A" }, { name: "B" }] };
    expect(resolveDeepJsonPath(obj, "items[0].name")).toBe("A");
    expect(resolveDeepJsonPath(obj, "items[1].name")).toBe("B");
  });

  it("returns fallback for missing paths", async () => {
    const { resolveDeepJsonPath } = await import("@plugins/smart-importer/advanced-features");
    expect(resolveDeepJsonPath({}, "x.y.z", "default")).toBe("default");
  });

  it("generates schema diff with additions", async () => {
    const { generateSchemaDiff } = await import("@plugins/smart-importer/advanced-features");
    const diff = generateSchemaDiff(
      { title: { type: "text" } },
      { title: { type: "text" }, body: { type: "richtext" } },
    );
    expect(diff.isCompatible).toBe(true);
    expect(diff.additions).toHaveLength(1);
    expect(diff.additions[0].fieldName).toBe("body");
  });

  it("detects dangerous type conversions", async () => {
    const { generateSchemaDiff } = await import("@plugins/smart-importer/advanced-features");
    const diff = generateSchemaDiff({ body: { type: "richtext" } }, { body: { type: "number" } });
    expect(diff.isCompatible).toBe(false);
    expect(diff.modifications[0].warning).toBe(true);
  });

  it("detects cyclic dependencies in a graph", async () => {
    const { resolveCyclicDependencies } = await import("@plugins/smart-importer/advanced-features");
    const graph = { A: ["B"], B: ["C"], C: ["A"], D: [] };
    const result = resolveCyclicDependencies(graph);
    expect(result.cyclesDetected.length).toBeGreaterThan(0);
    expect(result.orderedCollections).toContain("D");
  });

  it("streams database rows via async generator", async () => {
    const { streamDirectDatabaseConnection } =
      await import("@plugins/smart-importer/advanced-features");
    const stream = streamDirectDatabaseConnection(
      { url: "mock://db", dialect: "sqlite" },
      "test_table",
      10,
    );
    let totalRows = 0;
    for await (const batch of stream) {
      totalRows += batch.length;
      expect(batch.length).toBeLessThanOrEqual(10);
    }
    expect(totalRows).toBeGreaterThan(0);
  });

  it("runs self-diagnostics successfully", async () => {
    const { runAdvancedMechanicsDiagnostics } =
      await import("@plugins/smart-importer/advanced-features");
    expect(runAdvancedMechanicsDiagnostics()).toBe(true);
  });
});
