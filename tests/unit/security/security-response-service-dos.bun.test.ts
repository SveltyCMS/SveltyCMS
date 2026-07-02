/**
 * @file tests/unit/security/security-response-service-dos.bun.test.ts
 * @description Persistent DoS protection tests: dump/restore, corrupt files, concurrency.
 */
import { test, expect, describe, beforeEach, afterEach } from "vitest";
import { securityResponseService } from "@src/services/security/response-service";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// --- Helpers ---

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeUnlink(p: string) {
  try {
    await fs.unlink(p);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}

describe("Persistent DoS Protection", () => {
  let tempDir: string;
  let originalDumpPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-dos-"));
    originalDumpPath = (securityResponseService as any).DUMP_PATH;
    (securityResponseService as any).DUMP_PATH = path.join(tempDir, "security_rl_dump.json");
    await safeUnlink((securityResponseService as any).DUMP_PATH);
  });

  afterEach(async () => {
    await safeUnlink((securityResponseService as any).DUMP_PATH);
    if (originalDumpPath) (securityResponseService as any).DUMP_PATH = originalDumpPath;
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  test("should dump and restore rate limiter state", async () => {
    const ip = "1.2.3.4";
    const endpoint = "/api/auth/login";

    const first = await securityResponseService.checkRateLimit(ip, endpoint, undefined, true, 10);
    expect(first.action).toBe("throttle");

    await securityResponseService.destroy();
    expect(await fileExists((securityResponseService as any).DUMP_PATH)).toBe(true);

    (securityResponseService as any).limiters.clear();
    await (securityResponseService as any).restoreState();

    const restored = await securityResponseService.checkRateLimit(ip, endpoint, undefined, true, 1);
    expect(restored.action).toBe("throttle");
    expect(restored.reason).toContain("Rate limit exceeded");
  });

  test("should handle corrupt dump file gracefully", async () => {
    await fs.writeFile((securityResponseService as any).DUMP_PATH, "{invalid json");
    // bun:test doesn't support .resolves.not.toThrow() — use direct await
    await (securityResponseService as any).restoreState();
    const check = await securityResponseService.checkRateLimit(
      "5.5.5.5",
      "/test",
      undefined,
      true,
      1,
    );
    expect(check.action).toBe("allow");
  });

  test("should handle missing dump file gracefully", async () => {
    // bun:test doesn't support .resolves.not.toThrow() — use direct await
    await safeUnlink((securityResponseService as any).DUMP_PATH);
    await (securityResponseService as any).restoreState();
  });

  test("should clean up dump after successful restore", async () => {
    await securityResponseService.checkRateLimit("10.0.0.1", "/api/test", undefined, true, 10);
    await securityResponseService.destroy();
    await (securityResponseService as any).restoreState();
    expect(await fileExists((securityResponseService as any).DUMP_PATH)).toBe(false);
  });

  test("should handle concurrent restore attempts safely", async () => {
    await securityResponseService.checkRateLimit("172.16.0.1", "/api/login", undefined, true, 8);
    await securityResponseService.destroy();

    const restores = Array.from({ length: 5 }, () =>
      (securityResponseService as any).restoreState(),
    );
    // bun:test doesn't support .resolves.not.toThrow() — use Promise.allSettled
    const results = await Promise.allSettled(restores);
    for (const r of results) {
      expect(r.status).toBe("fulfilled");
    }
  });
});
