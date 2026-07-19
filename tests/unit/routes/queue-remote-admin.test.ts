/**
 * @file tests/unit/routes/queue-remote-admin.test.ts
 * @description Source-level contract: queue remotes always call requireAdmin before actions.
 * Prevents auth regression where mutations become public.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const remoteSrc = readFileSync(
  join(process.cwd(), "src/routes/(app)/config/queue/queue.remote.ts"),
  "utf8",
);

describe("queue.remote admin gate contract", () => {
  it("defines requireAdmin checking user + isAdmin", () => {
    expect(remoteSrc).toMatch(/function requireAdmin/);
    expect(remoteSrc).toMatch(/locals\.user/);
    expect(remoteSrc).toMatch(/locals\.isAdmin/);
    expect(remoteSrc).toMatch(/401/);
    expect(remoteSrc).toMatch(/403/);
  });

  it("every exported command calls requireAdmin before action import", () => {
    for (const name of ["retryJob", "deleteJob", "clearCompleted"]) {
      const idx = remoteSrc.indexOf(`export const ${name}`);
      expect(idx, name).toBeGreaterThanOrEqual(0);
      const slice = remoteSrc.slice(idx, idx + 280);
      expect(slice, `${name} must call requireAdmin`).toMatch(/requireAdmin\s*\(\s*\)/);
      expect(slice, `${name} must load queue-actions.server`).toMatch(/queue-actions\.server/);
    }
  });
});
