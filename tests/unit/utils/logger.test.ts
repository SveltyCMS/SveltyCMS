/**
 * @file tests/unit/utils/logger.test.ts
 * @description Logger level gates, once(), and isEnabled — keep CMS diagnostics cheap.
 *
 * Uses the real module via relative import path so global @utils/logger mock does not apply.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

// Load real logger from source (bypass moduleMock of @utils/logger)
const require = createRequire(import.meta.url);
const loggerPath = path.resolve(process.cwd(), "src/utils/logger.ts");

describe("logger (levels & once)", () => {
  const originalError = console.error;
  let logger: typeof import("@utils/logger").logger;

  beforeEach(() => {
    console.error = vi.fn();
    // Fresh require after cache bust for once keys isolation is hard (module singleton);
    // use unique keys per test instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    logger = require(loggerPath).logger;
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("exposes isEnabled and isLevel as cheap gates", () => {
    expect(typeof logger.isEnabled).toBe("function");
    expect(logger.isEnabled).toBe(logger.isLevel);
    expect(logger.isEnabled("error")).toBe(true);
    expect(logger.isEnabled("fatal")).toBe(true);
  });

  it("once() emits only the first call for a key", () => {
    const key = `test-once-${Date.now()}-${Math.random()}`;
    expect(logger.once(key, "error", "first")).toBe(true);
    expect(logger.once(key, "error", "second")).toBe(false);
    expect(console.error).toHaveBeenCalled();
    const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(logger.once(key, "error", "third")).toBe(false);
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it("channel.once namespaces keys", () => {
    const ch = logger.channel("auth");
    const key = `ch-${Date.now()}-${Math.random()}`;
    ch.once(key, "error", "a");
    ch.once(key, "error", "b");
    const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls.length;
    ch.once(key, "error", "c");
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
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
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
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

  it("resolveLogConfig: QUIET/BENCHMARK flag suppress above warn on server", () => {
    const { resolveLogConfig } = require(loggerPath);
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

  it("resolveLogConfig: level resolution honors LOG_LEVEL, LOG_LEVELS, prod default, invalid fallback", () => {
    const { resolveLogConfig } = require(loggerPath);
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
    const key = `mask-once-${Date.now()}-${Math.random()}`;
    logger.once(key, "error", "boot", { token: "tok-secret", tenantId: "t1" });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("tok-secret");
    expect(out).toContain('"tenantId":"t1"');
  });
});
