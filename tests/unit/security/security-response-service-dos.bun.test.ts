/**
 * @file tests/unit/security/security-response-service-dos.bun.test.ts
 * @description Persistent DoS protection tests: dump/restore, corrupt files, concurrency.
 */
import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type SecurityResponseServiceType =
  import("@src/services/security/response-service").SecurityResponseService;

/** Load the real module even when tests/unit/setup.ts applies the global mock. */
async function createService(): Promise<SecurityResponseServiceType> {
  const mod = await import(`@src/services/security/response-service?bun-unmock=${Date.now()}`);
  return new mod.SecurityResponseService();
}

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
  let service: SecurityResponseServiceType;
  let originalDumpPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-dos-"));
    service = await createService();
    originalDumpPath = (service as any).DUMP_PATH;
    (service as any).DUMP_PATH = path.join(tempDir, "security_rl_dump.json");
    await safeUnlink((service as any).DUMP_PATH);
  });

  afterEach(async () => {
    await safeUnlink((service as any).DUMP_PATH);
    if (originalDumpPath) (service as any).DUMP_PATH = originalDumpPath;
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  test("should dump and restore rate limiter state", async () => {
    const ip = "1.2.3.4";
    const endpoint = "/api/auth/login";

    const first = await service.checkRateLimit(ip, endpoint, undefined, true, 10);
    expect(first.action).toBe("throttle");

    await service.destroy();
    expect(await fileExists((service as any).DUMP_PATH)).toBe(true);

    (service as any).limiters.clear();
    await (service as any).restoreState();

    const restored = await service.checkRateLimit(ip, endpoint, undefined, true, 1);
    expect(restored.action).toBe("throttle");
    expect(restored.reason).toContain("Rate limit exceeded");
  });

  test("should handle corrupt dump file gracefully", async () => {
    await fs.writeFile((service as any).DUMP_PATH, "{invalid json");
    await (service as any).restoreState();
    const check = await service.checkRateLimit("5.5.5.5", "/test", undefined, true, 1);
    expect(check.action).toBe("allow");
  });

  test("should handle missing dump file gracefully", async () => {
    await safeUnlink((service as any).DUMP_PATH);
    await (service as any).restoreState();
  });

  test("should clean up dump after successful restore", async () => {
    await service.checkRateLimit("10.0.0.1", "/api/test", undefined, true, 10);
    await service.destroy();
    await (service as any).restoreState();
    expect(await fileExists((service as any).DUMP_PATH)).toBe(false);
  });

  test("should handle concurrent restore attempts safely", async () => {
    await service.checkRateLimit("172.16.0.1", "/api/login", undefined, true, 8);
    await service.destroy();

    const restores = Array.from({ length: 5 }, () => (service as any).restoreState());
    await Promise.all(restores);
  });
});
