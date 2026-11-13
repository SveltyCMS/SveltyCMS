/**
 * @file tests/unit/utils/benchmark-isolation.test.ts
 * @description Fail-closed benchmark isolation contract.
 *
 * A benchmark must never resolve the developer's live database, media tree or
 * Config-Sync root. `assertBenchmarkIsolation()` is the pre-flight the harness
 * runs before it spawns a server, so these cases pin the boundary rather than
 * the implementation: a live DB name, a live media folder and a live Config-Sync
 * export root are all rejected, and the sandbox roots are accepted.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBenchmarkIsolation,
  getLocalSandboxConfigSyncRoot,
  getLocalSandboxMediaRoot,
} from "@utils/benchmark-sandbox";

const ROOT = process.cwd();

describe("benchmark isolation pre-flight", () => {
  it("refuses to run without an explicit DB name", () => {
    expect(() => assertBenchmarkIsolation({}, ROOT)).toThrow(/DB_NAME is not set/);
  });

  it("rejects the live developer database name", () => {
    expect(() => assertBenchmarkIsolation({ DB_NAME: "sveltycms" }, ROOT)).toThrow(
      /not an isolated test\/benchmark database/,
    );
  });

  it("accepts the isolated benchmark database names", () => {
    expect(() => assertBenchmarkIsolation({ DB_NAME: "benchmark_shared" }, ROOT)).not.toThrow();
    expect(() => assertBenchmarkIsolation({ DB_NAME: "sveltycms_test" }, ROOT)).not.toThrow();
  });

  it("rejects media and Config-Sync roots inside the live trees", () => {
    expect(() =>
      assertBenchmarkIsolation(
        { DB_NAME: "benchmark_shared", MEDIA_FOLDER: path.join(ROOT, "mediaFolder") },
        ROOT,
      ),
    ).toThrow(/MEDIA_FOLDER/);

    expect(() =>
      assertBenchmarkIsolation(
        { DB_NAME: "benchmark_shared", MEDIA_FOLDER: path.join(ROOT, "media", "global") },
        ROOT,
      ),
    ).toThrow(/MEDIA_FOLDER/);

    expect(() =>
      assertBenchmarkIsolation(
        { DB_NAME: "benchmark_shared", SVELTY_CONFIG_SYNC_DIR: path.join(ROOT, "config", "sync") },
        ROOT,
      ),
    ).toThrow(/SVELTY_CONFIG_SYNC_DIR/);
  });

  it("rejects a path-shaped SQLite host that points at the live database directory", () => {
    expect(() =>
      assertBenchmarkIsolation(
        { DB_NAME: "benchmark_shared", DB_HOST: path.join(ROOT, "config", "database") },
        ROOT,
      ),
    ).toThrow(/DB_HOST/);
  });

  it("accepts the sandbox roots the harness supplies", () => {
    expect(() =>
      assertBenchmarkIsolation(
        {
          DB_NAME: "benchmark_shared",
          MEDIA_FOLDER: getLocalSandboxMediaRoot(),
          SVELTY_CONFIG_SYNC_DIR: getLocalSandboxConfigSyncRoot(),
          DB_HOST: "127.0.0.1",
        },
        ROOT,
      ),
    ).not.toThrow();
  });
});
