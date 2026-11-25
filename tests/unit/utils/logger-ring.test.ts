/**
 * @file tests/unit/utils/logger-ring.test.ts
 * @description Unit tests for logger single-pass masking hook and timestamp memoization.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

describe("Logger single-pass mask hook", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes registerLogSinkHook with pre-masked args once per emitted log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, registerLogSinkHook } =
      await vi.importActual<typeof import("@utils/logger")>("@utils/logger");

    const captured: Array<{ level: string; msg: string; maskedArgs: unknown[] }> = [];
    registerLogSinkHook((level, msg, maskedArgs) => {
      captured.push({ level, msg, maskedArgs });
    });

    try {
      logger.error("auth fail", { password: "secret-password", userEmail: "alice@example.com" });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].level).toBe("error");
      expect(captured[0].maskedArgs[0]).toEqual({
        password: "[REDACTED]",
        userEmail: "al***@example.com",
      });
    } finally {
      registerLogSinkHook(null);
    }
  });
});
