/**
 * @file tests/unit/compilation/zero-compile-fast-path.test.ts
 * @description Verifies compile() skips loading the TypeScript compiler/transformers on manifest cache hits.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transpileSpy = vi.fn(
  (code: string) =>
    ({
      outputText: code,
    }) as { outputText: string },
);
const preProcessSpy = vi.fn(() => ({ importedFiles: [] }));

vi.mock("typescript", () => ({
  ModuleKind: { ESNext: 99 },
  ModuleResolutionKind: { NodeJs: 2 },
  ScriptTarget: { ESNext: 99 },
  version: "6.0.3",
  transpileModule: transpileSpy,
  preProcessFile: preProcessSpy,
}));

import { compile } from "@src/utils/compilation/compile";

describe("compile zero-compilation fast path", () => {
  let rootDir = "";
  let userDir = "";
  let compiledDir = "";

  beforeEach(async () => {
    transpileSpy.mockClear();
    preProcessSpy.mockClear();
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-zero-compile-"));
    userDir = path.join(rootDir, "collections");
    compiledDir = path.join(rootDir, "compiled");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "posts.ts"),
      `export const schema = { _id: "posts", name: "Posts", fields: [] };\n`,
      "utf8",
    );
  });

  afterEach(async () => {
    if (rootDir) {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  it("invokes TypeScript only on cache miss and performs zero transpilation on warm boot hit", async () => {
    const first = await compile({
      userCollections: userDir,
      compiledCollections: compiledDir,
      tenantId: null,
    });

    expect(first.processed).toBe(1);
    expect(first.skipped).toBe(0);
    expect(first.noOp).toBe(false);
    expect(transpileSpy).toHaveBeenCalledTimes(1);

    transpileSpy.mockClear();
    preProcessSpy.mockClear();

    const second = await compile({
      userCollections: userDir,
      compiledCollections: compiledDir,
      tenantId: null,
    });

    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.noOp).toBe(true);
    expect(transpileSpy).not.toHaveBeenCalled();
    expect(preProcessSpy).not.toHaveBeenCalled();
  });
});
