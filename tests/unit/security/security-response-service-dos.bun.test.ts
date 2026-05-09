/**
 * @file  @src/tests/unit/security/persistent-dos.test.ts
 * @description Persistence Test: Ensure rate limiting state is saved across sessions,
 */
import { test, expect, describe } from "bun:test";
import { securityResponseService } from "@src/services/security/response-service";
import fs from "node:fs/promises";
import path from "node:path";

describe("Persistent DoS Protection", () => {
  const DUMP_PATH = path.resolve(process.cwd(), "config/database/security_rl_dump.json");

  test("should dump and restore rate limiter state", async () => {
    // 1. Trigger some rate limiting activity (consume 10 points, limit is 5)
    const ip = "1.2.3.4";
    const endpoint = "/api/auth/login";

    // Use public API with forceSecurity to bypass test-mode bypass
    const resFirst = await securityResponseService.checkRateLimit(
      ip,
      endpoint,
      undefined,
      true,
      10,
    );
    expect(resFirst.action).toBe("throttle");

    // 2. Trigger dump
    await securityResponseService.destroy();

    // 3. Verify file exists
    const exists = await fs
      .access(DUMP_PATH)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // 4. Manually trigger restore on a NEW instance (or clear current state)
    (securityResponseService as any).limiters.clear();
    await (securityResponseService as any).restoreState();

    // 5. Check if state is back. It should still be throttled.
    const resAfter = await securityResponseService.checkRateLimit(ip, endpoint, undefined, true, 1);

    expect(resAfter.action).toBe("throttle");
    expect(resAfter.reason).toContain("Rate limit exceeded");

    // 6. Verify file is cleaned up after restore
    const existsAfter = await fs
      .access(DUMP_PATH)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);
  });
});
