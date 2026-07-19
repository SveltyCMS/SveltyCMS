/**
 * @file tests/unit/utils/private-config-policy.test.ts
 * @description Local vs CI ownership of config/private.ts.
 */

import { describe, expect, it } from "vitest";
import { assertLocalMustNotMutatePrivateTs, isCiRunner } from "@src/utils/private-config-policy";

describe("private-config-policy", () => {
  it("detects CI runners", () => {
    expect(isCiRunner({ CI: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isCiRunner({ GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isCiRunner({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isCiRunner({ CI: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("blocks local mutation of private.ts", () => {
    expect(() =>
      assertLocalMustNotMutatePrivateTs("overwrite", { CI: "false" } as NodeJS.ProcessEnv),
    ).toThrow(/private\.test\.ts only/);
  });

  it("allows mutation intent on CI", () => {
    expect(() =>
      assertLocalMustNotMutatePrivateTs("mirror", { CI: "true" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
