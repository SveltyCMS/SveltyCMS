/**
 * @file tests/unit/scripts/lint-global-timers.test.ts
 * @description Fixtures for the module-scope timer scanner. Pins the two real
 * leak shapes (bare call, module-local `const`) and the HMR-safe state pattern.
 */

import { describe, expect, it } from "vitest";
import { findUnsafeModuleTimers } from "../../../scripts/lint/lint-global-timers";

const file = (path: string, source: string) => ({ path, source });

describe("findUnsafeModuleTimers", () => {
  it("flags a bare module-scope timer", () => {
    const offenses = findUnsafeModuleTimers([file("src/a.ts", "setInterval(() => {}, 1000);")]);

    expect(offenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 1, reason: "missing globalThis guard" }),
        expect.objectContaining({ line: 1, reason: "missing unref" }),
      ]),
    );
  });

  it("flags a module-local const even when it is unref'd", () => {
    const offenses = findUnsafeModuleTimers([
      file(
        "src/b.ts",
        "const flushTimer = setInterval(() => {}, 1000);\nvoid flushTimer.unref?.();\n",
      ),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.reason).toBe("missing globalThis guard");
  });

  it("accepts a globalThis-backed state property with unref", () => {
    const offenses = findUnsafeModuleTimers([
      file(
        "src/c.ts",
        [
          "const g = globalThis as any;",
          "const state = (g.__timer ??= { timer: null });",
          "if (!state.timer) {",
          "  state.timer = setInterval(() => {}, 1000);",
          "  state.timer.unref?.();",
          "}",
        ].join("\n"),
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores timers inside function bodies", () => {
    const offenses = findUnsafeModuleTimers([
      file("src/d.ts", "function start() {\n    return setInterval(() => {}, 1000);\n}\n"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("honours the suppression marker", () => {
    const offenses = findUnsafeModuleTimers([
      file("src/e.ts", "// lint-global-timers: allow\nsetInterval(() => {}, 1000);"),
    ]);

    expect(offenses).toEqual([]);
  });
});
