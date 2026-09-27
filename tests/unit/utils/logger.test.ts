/**
 * @file tests/unit/utils/logger.test.ts
 * @description Logger level gates, once(), and isEnabled — keep CMS diagnostics cheap.
 *
 * Uses the real module via `vi.importActual` so the global @utils/logger mock does not apply.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

describe("logger (levels & once)", () => {
  let logger: typeof import("@utils/logger").logger;
  let errorSpy: MockInstance<typeof console.error>;
  /**
   * `once()` de-duplicates against a module-level key set, so every test needs a
   * key no other test used. A counter keeps that deterministic (no clock/random).
   */
  let keySeq = 0;
  const uniqueKey = (prefix: string) => `${prefix}-${++keySeq}`;

  beforeEach(async () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger = (await vi.importActual<typeof import("@utils/logger")>("@utils/logger")).logger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes isEnabled and isLevel as cheap gates", () => {
    expect(typeof logger.isEnabled).toBe("function");
    expect(logger.isEnabled).toBe(logger.isLevel);
    expect(logger.isEnabled("error")).toBe(true);
    expect(logger.isEnabled("fatal")).toBe(true);
  });

  it("once() emits only the first call for a key", () => {
    const key = uniqueKey("test-once");

    expect(logger.once(key, "error", "first")).toBe(true);
    expect(logger.once(key, "error", "second")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    const calls = errorSpy.mock.calls.length;

    expect(logger.once(key, "error", "third")).toBe(false);
    expect(errorSpy.mock.calls.length).toBe(calls);
  });

  it("channel.once namespaces keys", () => {
    const ch = logger.channel("auth");
    const key = uniqueKey("ch");

    ch.once(key, "error", "a");
    ch.once(key, "error", "b");
    const calls = errorSpy.mock.calls.length;

    ch.once(key, "error", "c");
    expect(errorSpy.mock.calls.length).toBe(calls);
  });

  it("masks secret keys but keeps ordinary context keys", () => {
    logger.error("ctx", {
      password: "hunter2",
      apiKey: "sk-123",
      api_key: "sk-456",
      secretKey: "sk-789",
      key: "standalone",
      authorId: "u1",
      keywords: ["admin"],
      cacheKey: "collection:posts",
      email: "jane@example.com",
    });
    const out = errorSpy.mock.calls[0][0] as string;
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk-123");
    expect(out).not.toContain("sk-456");
    expect(out).not.toContain("sk-789");
    expect(out).not.toContain("standalone");
    // Over-redaction guards: context fields stay visible
    expect(out).toContain('"authorId":"u1"');
    expect(out).toContain('"keywords"');
    expect(out).toContain('"cacheKey"');
    // Email-like fields are partially masked, not fully redacted
    expect(out).toContain("ja***@example.com");
    expect(out).not.toContain("jane@example.com");
  });

  it("resolveLogConfig: QUIET/BENCHMARK flag suppress above warn on server", async () => {
    const { resolveLogConfig } =
      await vi.importActual<typeof import("@utils/logger")>("@utils/logger");
    expect(resolveLogConfig({ QUIET: "true", NODE_ENV: "test" }).quiet).toBe(true);
    expect(resolveLogConfig({ BENCHMARK: "true", NODE_ENV: "test" }).quiet).toBe(true);
    expect(resolveLogConfig({ NODE_ENV: "test" }).quiet).toBe(false);
    const benchDebug = resolveLogConfig({
      QUIET: "true",
      BENCHMARK_DEBUG: "true",
      NODE_ENV: "test",
    });
    expect(benchDebug.quiet).toBe(true);
    expect(benchDebug.benchmarkDebug).toBe(true);
    // Default dev ceiling is info (priority 4); QUIET suppresses priority > warn (3)
    expect(resolveLogConfig({ NODE_ENV: "test" }).priority).toBe(4);
  });

  it("resolveLogConfig: level resolution honors LOG_LEVEL, LOG_LEVELS, prod default, invalid fallback", async () => {
    const { resolveLogConfig } =
      await vi.importActual<typeof import("@utils/logger")>("@utils/logger");
    expect(resolveLogConfig({ LOG_LEVEL: "error", NODE_ENV: "test" }).level).toBe("error");
    expect(resolveLogConfig({ LOG_LEVELS: "debug", NODE_ENV: "test" }).level).toBe("debug");
    expect(resolveLogConfig({ VITE_LOG_LEVELS: "warn" }).level).toBe("warn");
    // LOG_LEVELS (plural) wins over singular
    expect(resolveLogConfig({ LOG_LEVELS: "debug", LOG_LEVEL: "error" }).level).toBe("debug");
    // Production default is error when nothing is set
    expect(resolveLogConfig({ NODE_ENV: "production" }).level).toBe("error");
    // Dev default is info
    expect(resolveLogConfig({ NODE_ENV: "test" }).level).toBe("info");
    // Unknown value falls back to info
    expect(resolveLogConfig({ LOG_LEVEL: "loud", NODE_ENV: "test" }).level).toBe("info");
    // Comma-separated lists take the first entry
    expect(resolveLogConfig({ LOG_LEVEL: "error,debug" }).level).toBe("error");
    // Undefined env never throws
    expect(resolveLogConfig(undefined).level).toBe("info");
  });

  it("masked args never leak secrets through the once() path either", () => {
    const key = uniqueKey("mask-once");

    logger.once(key, "error", "boot", { token: "tok-secret", tenantId: "t1" });
    const out = errorSpy.mock.calls[0][0] as string;

    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("tok-secret");
    expect(out).toContain('"tenantId":"t1"');
  });
});
