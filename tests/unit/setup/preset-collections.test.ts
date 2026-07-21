import { describe, expect, it } from "vitest";
import {
  collectionPresetToSchema,
  generateCollectionFileContent,
  getWizardPresetSchemas,
  isBenchmarkArtifact,
  isMockScanCollection,
  purgeBenchmarkCollectionArtifacts,
} from "@src/routes/setup/preset-collections.server";
import { PRESETS } from "@src/routes/setup/presets";

describe("preset-collections.server", () => {
  it("resolves blog preset from presets.ts with lowercase ids", async () => {
    const schemas = await getWizardPresetSchemas("blog");
    expect(schemas.length).toBe(3);
    expect(schemas.map((s) => s._id).sort()).toEqual(["authors", "categories", "posts"]);
  });

  it("generates valid collection files with widgets import and _id", () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    const posts = blog?.collections?.[0];
    expect(posts).toBeDefined();

    const content = generateCollectionFileContent(posts!);
    expect(content).toContain('import { widgets } from "@src/widgets"');
    expect(content).toContain('_id: "posts"');
    expect(content).toContain("config/collections/posts.ts");
  });

  it("maps field types to core widget names for database schemas", () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    const posts = blog?.collections?.[0];
    const schema = collectionPresetToSchema(posts!);
    const titleField = schema.fields?.find((f: any) => (f as any).db_fieldName === "title") as {
      widget?: { Name?: string };
    };
    expect(titleField?.widget?.Name).toBe("Input");
  });

  it("falls back to benchmark PRESET_COLLECTIONS for demo preset", async () => {
    const schemas = await getWizardPresetSchemas("demo");
    expect(schemas.some((s) => s._id === "BenchmarkStable")).toBe(true);
    expect(schemas.some((s) => s._id === "redirects")).toBe(true);
  });

  it("detects BenchmarkStable as a benchmark artifact", () => {
    expect(isBenchmarkArtifact("BenchmarkStable.ts")).toBe(true);
    expect(isBenchmarkArtifact("benchmarkstable.js")).toBe(true);
    expect(isBenchmarkArtifact("mock_collection_42.js")).toBe(true);
    expect(isBenchmarkArtifact("posts.ts")).toBe(false);
  });

  it("detects mock scan collections for GraphQL exclusion", () => {
    expect(isMockScanCollection("mock-collection-0", "Mock Collection 0")).toBe(true);
    expect(isMockScanCollection("mock_collection_42")).toBe(true);
    expect(isMockScanCollection("mockcollection42")).toBe(true);
    expect(isMockScanCollection("BenchmarkStable")).toBe(false);
    expect(isMockScanCollection("benchmark_authors")).toBe(false);
  });

  it("purge removes benchmark test workspaces", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sourceDir = path.resolve("config/test-collections/purge-test");
    const compiledDir = path.resolve(".compiledCollections/test-collections/purge-test");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(compiledDir, { recursive: true });
    const sourceArtifact = path.join(sourceDir, "BenchmarkStable.ts");
    const compiledArtifact = path.join(compiledDir, "BenchmarkStable.js");
    await fs.writeFile(sourceArtifact, "export default {};", "utf-8");
    await fs.writeFile(compiledArtifact, "export default {};", "utf-8");

    const removed = await purgeBenchmarkCollectionArtifacts();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(
      await fs
        .access(sourceArtifact)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    expect(
      await fs
        .access(compiledArtifact)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
