/**
 * @file tests/unit/scripts/lint-widgets.test.ts
 * @description Regression test for the widget linter CLI guard
 * (scripts/lint/lint-widgets.ts).
 *
 * Features:
 * - Importing the module must not execute `run()` (no output, no process.exit)
 * - The pure a11y audit stays importable for unit tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("lint-widgets — CLI guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does not execute run() when imported", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit must not be called while importing lint-widgets");
    });

    const mod = await import("../../../scripts/lint/lint-widgets.ts");

    expect(typeof mod.auditWidgetA11y).toBe("function");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
