/**
 * @file tests/unit/test-harness/negative-mock-guard.test.ts
 * @description Spawns an isolated subprocess so REAL_DB markers in the same CLI cannot disable mocks.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ISOLATED_TARGET = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "negative-mock-guard-isolated.test.ts",
);

describe("Negative mock guard", () => {
  it("assertRealAdapter throws when mockDbAdapter is active", () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "test", ISOLATED_TARGET],
      cwd: process.cwd(),
      env: {
        ...process.env,
        BUN_TEST_MOCKS: "true",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();

    expect(
      result.exitCode,
      `Isolated mock guard subprocess failed.\nstdout: ${stdout}\nstderr: ${stderr}`,
    ).toBe(0);
  });
});
