/**
 * @file tests/unit/content/loader-utils.test.ts
 * @description Unit tests for the compiled-schema loader: path confinement,
 * deterministic hashing, and an end-to-end native load of a real compiled
 * schema file (same path the engine scanner runs at boot).
 */

import fsPromises from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Hermetic: the real registry scans widget modules; loader tests only need the
// global widgets proxy to exist for compiled modules that reference it.
vi.mock("@src/services/core/widget-registry-service", () => ({
  widgetRegistryService: { getAllWidgets: async () => new Map() },
}));

import {
  generateSchemaHash,
  isSafeCollectionPath,
  loadSchemaNative,
} from "@src/content/loader.server";

const CWD = process.cwd();
const preExistingWidgets = (globalThis as Record<string, unknown>).widgets;

let tempDir: string | null = null;

function compiledPath(name: string): string {
  return path.join(tempDir!, name);
}

beforeAll(async () => {
  // Real confinement root: nested under <cwd>/.compiledCollections (gitignored),
  // exactly like the production scanner's target directory.
  tempDir = await fsPromises.mkdtemp(path.join(CWD, ".compiledCollections", ".loader-test-"));
  await fsPromises.writeFile(
    compiledPath("posts.js"),
    `export const schema = {
  _id: "posts",
  name: "Posts",
  slug: "posts",
  status: "published",
  fields: [
    { db_fieldName: "title", label: "Title", required: true, widget: { Name: "Input" } },
    { db_fieldName: "body", label: "Body", widget: { Name: "RichText" } },
  ],
};
`,
    "utf8",
  );
});

afterAll(async () => {
  if (tempDir) {
    await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = null;
  }
  if (preExistingWidgets === undefined) {
    delete (globalThis as Record<string, unknown>).widgets;
  } else {
    (globalThis as Record<string, unknown>).widgets = preExistingWidgets;
  }
});

describe("isSafeCollectionPath", () => {
  it("accepts compiled .js files under .compiledCollections", () => {
    expect(isSafeCollectionPath(path.join(CWD, ".compiledCollections", "posts.js"))).toBe(true);
    expect(isSafeCollectionPath(compiledPath("posts.js"))).toBe(true);
  });

  it("accepts source .ts files under config/collections", () => {
    expect(isSafeCollectionPath(path.join(CWD, "config", "collections", "posts.ts"))).toBe(true);
  });

  it("rejects traversal, wrong extensions, and out-of-root paths", () => {
    expect(isSafeCollectionPath(path.join(CWD, ".compiledCollections", "..", "secret.js"))).toBe(
      false,
    );
    expect(isSafeCollectionPath(path.join(CWD, "config", "collections", "posts.js"))).toBe(false);
    expect(isSafeCollectionPath(path.join(CWD, ".compiledCollections", "posts.ts"))).toBe(false);
    expect(isSafeCollectionPath(path.join(CWD, "src", "content", "types.ts"))).toBe(false);
    expect(isSafeCollectionPath(path.join(CWD, "config", "private.ts"))).toBe(false);
  });
});

describe("generateSchemaHash", () => {
  const schema = {
    name: "Posts",
    fields: [
      { db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { db_fieldName: "body", widget: { Name: "RichText" }, required: false },
    ],
  } as any;

  it("is deterministic for identical schemas", () => {
    expect(generateSchemaHash(schema)).toBe(generateSchemaHash(schema));
    expect(generateSchemaHash(schema)).toBe(generateSchemaHash(structuredClone(schema)));
  });

  it("changes when field identity or widget type changes", () => {
    const renamed = structuredClone(schema);
    renamed.fields[0].db_fieldName = "headline";
    expect(generateSchemaHash(renamed)).not.toBe(generateSchemaHash(schema));

    const rewired = structuredClone(schema);
    rewired.fields[1].widget.Name = "Markdown";
    expect(generateSchemaHash(rewired)).not.toBe(generateSchemaHash(schema));
  });
});

describe("loadSchemaNative (boot path)", () => {
  it("loads and normalizes a real compiled schema file", async () => {
    const result = await loadSchemaNative(compiledPath("posts.js"));
    expect(result?.schema).toBeDefined();
    expect(result?.schema?._id).toBe("posts");
    expect(result?.schema?.name).toBe("Posts");
    expect(result?.schema?.fields).toHaveLength(2);
    expect((result?.schema?.fields?.[0] as any)?.widget?.Name).toBe("Input");
  });

  it("returns null for missing files without throwing", async () => {
    await expect(loadSchemaNative(compiledPath("missing.js"))).resolves.toBeNull();
  });

  it("rejects out-of-confinement paths with null (not a throw)", async () => {
    const outside = path.join(CWD, "config", "collections", "posts.ts");
    await expect(loadSchemaNative(outside)).resolves.toBeNull();
  });

  it("reuses the installed widgets proxy across loads (no re-install)", async () => {
    const installed = (globalThis as any).widgets;
    await loadSchemaNative(compiledPath("posts.js"));
    expect((globalThis as any).widgets).toBe(installed);
  });

  it("replaces a foreign widgets global with its own proxy once", async () => {
    (globalThis as any).widgets = { Fake: () => ({}) };
    await loadSchemaNative(compiledPath("posts.js"));
    const installed = (globalThis as any).widgets;
    expect(installed).not.toEqual({ Fake: () => ({}) });
    // Proxy resolves unknown widget names case-insensitively via fallback factory.
    const fallback = installed?.MissingWidget?.({ label: "X" });
    expect(fallback?.db_fieldName).toBe("missingwidget");
    expect(fallback?.widget?.Name).toBe("MissingWidget");
    // And stays stable for the next load.
    await loadSchemaNative(compiledPath("posts.js"));
    expect((globalThis as any).widgets).toBe(installed);
  });
});
