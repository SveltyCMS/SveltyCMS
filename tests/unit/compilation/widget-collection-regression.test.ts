/**
 * @file tests/unit/compilation/widget-collection-regression.test.ts
 * @description End-to-end regression for transformer v6: real fixture collection
 * (widget factory calls nested under an exported schema) compiled through the
 * REAL compile() pipeline. Guards the schema-injection early-return bug where
 * `widgets.*` under `schema.fields` was never rewritten to `globalThis.widgets.*`
 * and no deterministic widget-call `uuid` was injected.
 */

import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "@src/utils/compilation/compile";

/** Read-only fixture source — compiled into per-test temp dirs. */
const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "collections");

/** Suppress [Compile] progress noise (still surfaces errors). */
const quietLogger = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: (msg: string, err?: unknown) => console.error(`[Compile] ${msg}`, err),
};

const tempRoots: string[] = [];
/** The unit setup installs a widgets mock on globalThis — restore it, don't delete it. */
const preExistingWidgets = (globalThis as Record<string, unknown>).widgets;

async function makeCompiledDir(): Promise<string> {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "widget-regression-"));
  tempRoots.push(root);
  const compiled = path.join(root, ".compiledCollections");
  await fsPromises.mkdir(compiled, { recursive: true });
  return compiled;
}

async function compileFixture(compiledDir: string) {
  return compile({
    userCollections: FIXTURES_DIR,
    compiledCollections: compiledDir,
    concurrency: 2,
    logger: quietLogger,
  });
}

afterAll(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fsPromises.rm(root, { recursive: true, force: true })),
  );
  if (preExistingWidgets === undefined) {
    delete (globalThis as Record<string, unknown>).widgets;
  } else {
    (globalThis as Record<string, unknown>).widgets = preExistingWidgets;
  }
});

describe("widget collection compile regression (transformer v6)", () => {
  it("rewrites widgets.* to globalThis.widgets.* under the exported schema", async () => {
    const compiledDir = await makeCompiledDir();
    const result = await compileFixture(compiledDir);
    expect(result.errors).toHaveLength(0);

    const out = await fsPromises.readFile(path.join(compiledDir, "posts.js"), "utf8");
    // Pass 4 must reach widget calls nested in schema.fields (v6 descend fix).
    expect(out).toContain("globalThis.widgets.text({");
    expect(out).toContain("globalThis.widgets.group({");
    expect(out).toContain("globalThis.widgets.textarea({");
    // No bare `widgets.` member access may remain (dot-prefixed
    // globalThis.widgets.* is the rewritten form and must not match).
    expect(out).not.toMatch(/(^|[^\w$.])widgets\.\w/);
    // Widget proxy import removed, helper import got its .js suffix.
    expect(out).not.toContain("widget-manager");
    expect(out).toContain("./helpers.js");
    // Schema injection still applies.
    expect(out).toContain('_id: "posts"');
  });

  it("injects a deterministic uuid into every widget call argument (nested included)", async () => {
    const compiledDir = await makeCompiledDir();
    const result = await compileFixture(compiledDir);
    expect(result.errors).toHaveLength(0);

    const out = await fsPromises.readFile(path.join(compiledDir, "posts.js"), "utf8");
    // text + group + textarea = 3 factory calls, each gets exactly one uuid.
    const uuidMatches = out.match(
      /uuid: "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
    );
    expect(uuidMatches).toHaveLength(3);
    // uuid is the first property of each options object.
    expect(out.indexOf("uuid:")).toBeLessThan(out.indexOf("db_fieldName"));
  });

  it("is byte-identical across fresh compiles (deterministic)", async () => {
    const firstDir = await makeCompiledDir();
    const secondDir = await makeCompiledDir();
    await compileFixture(firstDir);
    await compileFixture(secondDir);

    const first = await fsPromises.readFile(path.join(firstDir, "posts.js"), "utf8");
    const second = await fsPromises.readFile(path.join(secondDir, "posts.js"), "utf8");
    expect(second).toBe(first);
  });

  it("compiled module executes and field configs carry the injected uuid (loader parity)", async () => {
    const compiledDir = await makeCompiledDir();
    const result = await compileFixture(compiledDir);
    expect(result.errors).toHaveLength(0);

    // Loader parity (loader.server.ts sets globalThis.widgets before import()).
    (globalThis as Record<string, unknown>).widgets = new Proxy(
      {},
      { get: () => (opts: Record<string, unknown>) => ({ ...opts }) },
    );
    const url = pathToFileURL(path.join(compiledDir, "posts.js"));
    url.search = `?v=${Date.now()}`;
    const module = await import(/* @vite-ignore */ url.href);

    const fields = (module as { schema?: { fields?: Array<Record<string, unknown>> } }).schema
      ?.fields;
    expect(fields).toHaveLength(2);
    expect(fields?.[0]?.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    const groupChildren = (fields?.[1]?.fields as Array<Record<string, unknown>>) ?? [];
    expect(groupChildren[0]?.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    // Module-level helper export still wired to the .js dependency.
    const makeSlug = (module as { makeSlug?: (s: string) => string }).makeSlug;
    expect(makeSlug?.("Hello World")).toBe("hello-world");
  });
});
