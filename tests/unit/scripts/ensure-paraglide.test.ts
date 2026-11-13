/**
 * @file tests/unit/scripts/ensure-paraglide.test.ts
 * @description Pins the paraglide bootstrap's failure paths.
 *
 * A fresh worktree imports `@src/paraglide/runtime` from every unit suite, so
 * this script is the difference between a reproducible suite and one that only
 * passes after an unrelated manual step. The compiler is injected here — no
 * `bun run paraglide` is ever spawned by the test.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ensureParaglideOutput,
  PARAGLIDE_OUTPUT,
  type EnsureParaglideDeps,
} from "../../../scripts/check/ensure-paraglide";

function deps(overrides: Partial<EnsureParaglideDeps> = {}): {
  options: EnsureParaglideDeps;
  logs: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const options: EnsureParaglideDeps = {
    outputPath: PARAGLIDE_OUTPUT,
    exists: () => false,
    compile: () => 0,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    ...overrides,
  };
  return { options, logs, errors };
}

describe("ensureParaglideOutput", () => {
  it("does nothing when the generated runtime already exists", () => {
    const compile = vi.fn(() => 0);
    const { options, logs } = deps({ exists: () => true, compile });

    expect(ensureParaglideOutput(options)).toBe(0);
    expect(compile).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("compiles once when the output is missing and accepts a produced file", () => {
    let produced = false;
    const compile = vi.fn(() => {
      produced = true;
      return 0;
    });
    const { options, logs } = deps({ exists: () => produced, compile });

    expect(ensureParaglideOutput(options)).toBe(0);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([
      `[ensure-paraglide] ${PARAGLIDE_OUTPUT} missing - compiling i18n output`,
    ]);
  });

  it("propagates the compiler exit code", () => {
    const { options, errors } = deps({ compile: () => 2 });

    expect(ensureParaglideOutput(options)).toBe(2);
    expect(errors).toEqual([
      "[ensure-paraglide] compile failed. Run `bun run paraglide` manually and read its output.",
    ]);
  });

  it("fails closed when a successful compile produces no output", () => {
    const { options, errors } = deps({ compile: () => 0 });

    expect(ensureParaglideOutput(options)).toBe(1);
    expect(errors).toEqual([
      `[ensure-paraglide] compile reported success but ${PARAGLIDE_OUTPUT} still does not exist.`,
    ]);
  });
});
