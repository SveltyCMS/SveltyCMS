/**
 * @file tests/unit/utils/private-config-policy.test.ts
 * @description Live private.ts must never be used by automated local harnesses.
 */

import { describe, expect, it } from "vitest";
import {
  assertAutomatedMustNotUseLivePrivateTs,
  assertLocalMustNotMutatePrivateTs,
  isAutomatedTestHarness,
  isCiRunner,
  resolvePrivateConfigFileName,
} from "@src/utils/private-config-policy";

describe("private-config-policy", () => {
  it("detects CI runners", () => {
    expect(isCiRunner({ CI: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isCiRunner({ GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isCiRunner({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("detects automated harnesses that must not use live private.ts", () => {
    expect(isAutomatedTestHarness({ TEST_MODE: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isAutomatedTestHarness({ COMPILE_ALL_ADAPTERS: "true" } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(isAutomatedTestHarness({ SVELTY_PRECHECK: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isAutomatedTestHarness({ PLAYWRIGHT_TEST: "true" } as NodeJS.ProcessEnv)).toBe(true);
    // Normal local dev — may use private.ts
    expect(isAutomatedTestHarness({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("resolves private.test.ts for all automated harnesses", () => {
    expect(resolvePrivateConfigFileName({ TEST_MODE: "true" } as NodeJS.ProcessEnv)).toBe(
      "private.test.ts",
    );
    expect(
      resolvePrivateConfigFileName({ COMPILE_ALL_ADAPTERS: "true" } as NodeJS.ProcessEnv),
    ).toBe("private.test.ts");
    expect(resolvePrivateConfigFileName({} as NodeJS.ProcessEnv)).toBe("private.ts");
  });

  it("blocks local mutation of private.ts", () => {
    expect(() =>
      assertLocalMustNotMutatePrivateTs("overwrite", { CI: "false" } as NodeJS.ProcessEnv),
    ).toThrow(/private\.test\.ts only/);
  });

  it("blocks local automated reads of live private.ts", () => {
    expect(() =>
      assertAutomatedMustNotUseLivePrivateTs("load", {
        TEST_MODE: "true",
        CI: "false",
      } as NodeJS.ProcessEnv),
    ).toThrow(/protect live data/);
  });

  it("allows CI to mirror private.ts", () => {
    expect(() =>
      assertLocalMustNotMutatePrivateTs("mirror", { CI: "true" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
