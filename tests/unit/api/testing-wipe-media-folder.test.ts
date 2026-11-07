/**
 * @file tests/unit/api/testing-wipe-media-folder.test.ts
 * @description Regression: the testing API's media wipe must honour the harness
 * `MEDIA_FOLDER` and never empty the developer's `mediaFolder`.
 *
 * A local Playwright run pointed `MEDIA_FOLDER` at its own root, but the reset
 * handler still read the persisted dev setting and deleted `./mediaFolder`,
 * leaving the dev DB rows pointing at missing files.
 *
 * ### Features:
 * - Isolates the wipe target through a temp `MEDIA_FOLDER`
 * - Asserts a decoy dev root survives untouched
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wipeMediaFolder } from "@src/routes/api/[...path]/handlers/testing/testing-shared";
import {
  assertHarnessMediaFolderWritable,
  DEFAULT_HARNESS_MEDIA_FOLDER,
  resolveConfiguredMediaFolder,
} from "@src/utils/media/storage-adapters";

describe("wipeMediaFolder", () => {
  let root: string;
  let devRoot: string;
  let isolatedRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "svelty-wipe-"));
    devRoot = join(root, "mediaFolder");
    isolatedRoot = join(root, "tests-e2e-media");
    mkdirSync(devRoot, { recursive: true });
    mkdirSync(isolatedRoot, { recursive: true });
    writeFileSync(join(devRoot, "keep.png"), "developer asset");
    writeFileSync(join(isolatedRoot, "wipe.png"), "test asset");
    vi.stubEnv("MEDIA_FOLDER", isolatedRoot);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("empties the harness MEDIA_FOLDER and leaves the dev mediaFolder alone", async () => {
    await wipeMediaFolder();

    expect(existsSync(isolatedRoot)).toBe(true);
    expect(readdirSync(isolatedRoot)).toEqual([]);
    expect(existsSync(join(devRoot, "keep.png"))).toBe(true);
  });

  it("refuses to wipe or write the live mediaFolder or media directory under a test harness", () => {
    expect(() => assertHarnessMediaFolderWritable("mediaFolder")).toThrow(/\[LiveDataGuard\]/);
    expect(() => assertHarnessMediaFolderWritable("./mediaFolder")).toThrow(/\[LiveDataGuard\]/);
    expect(() => assertHarnessMediaFolderWritable("media")).toThrow(/\[LiveDataGuard\]/);
    expect(() => assertHarnessMediaFolderWritable(isolatedRoot)).not.toThrow();
  });

  it("falls back to the isolated harness media folder when MEDIA_FOLDER is unset or points at live mediaFolder", () => {
    vi.stubEnv("MEDIA_FOLDER", "");
    expect(resolveConfiguredMediaFolder()).toBe(DEFAULT_HARNESS_MEDIA_FOLDER);

    vi.stubEnv("MEDIA_FOLDER", "mediaFolder");
    expect(resolveConfiguredMediaFolder()).toBe(DEFAULT_HARNESS_MEDIA_FOLDER);
  });
});
