/**
 * @file tests/unit/package-exports.test.ts
 * @description
 * Validates that the core SDK and widget factory barrel exports
 * from src/ are correctly wired — all expected types and classes are importable.
 *
 * These tests ensure the public API surface doesn't regress when
 * internal modules are refactored.
 *
 * Note: Widget scanner tests may fail in Bun due to import.meta.glob
 * (Vite-specific API). The scanner works correctly in Vite/SvelteKit builds.
 */

import { describe, expect, it } from "vitest";

describe("Core SDK exports", () => {
  it("exports LocalCMS constructor", async () => {
    const { LocalCMS } = await import("../../src/services/sdk");
    expect(LocalCMS).toBeDefined();
    expect(typeof LocalCMS).toBe("function");
  });

  it("exports AppError", async () => {
    const { AppError } = await import("../../src/utils/error-handling");
    expect(AppError).toBeDefined();
    const err = new AppError("test", 400, "TEST_ERROR");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("test");
    expect(err.status).toBe(400);
  });

  it("loads without runtime errors", async () => {
    const mod = await import("../../src/services/sdk");
    expect(mod).toBeDefined();
  });
});

describe("Standalone DB adapter packages", () => {
  const adapters = [
    ["sveltycms-sqlite", "SQLiteAdapter"],
    ["sveltycms-mongodb", "MongoDBAdapter"],
    ["sveltycms-mariadb", "MariaDBAdapter"],
    ["sveltycms-postgresql", "PostgreSQLAdapter"],
  ] as const;

  it("ships package.json + README + src/index.ts for each adapter", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    for (const [name] of adapters) {
      const pkg = JSON.parse(
        await readFile(join(process.cwd(), "packages", name, "package.json"), "utf8"),
      ) as { name: string; exports: { ".": { import: string } } };
      expect(pkg.name).toBe(name);
      expect(pkg.exports["."].import).toBe("./src/index.ts");
    }
  });

  it("re-exports the in-tree adapter class names", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    for (const [name, className] of adapters) {
      const src = await readFile(join(process.cwd(), "packages", name, "src/index.ts"), "utf8");
      expect(src).toContain(`export { ${className} }`);
    }
  });
});

describe("Widget factory exports", () => {
  it("exports createWidget factory", async () => {
    const { createWidget } = await import("../../src/widgets/widget-factory");
    expect(createWidget).toBeDefined();
    expect(typeof createWidget).toBe("function");
  });

  it("exports type guards", async () => {
    const mod = await import("../../src/widgets/types");
    expect(mod).toBeDefined();
    expect(mod.isWidgetFactory).toBeDefined();
    expect(mod.isWidgetDefinition).toBeDefined();
  });
});
