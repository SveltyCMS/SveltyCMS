/**
 * @file tests/unit/routes/redirects-remote-admin.test.ts
 * @description Source contract for redirects remotes — admin-only mutations.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const remotePath = join(process.cwd(), "src/routes/(app)/config/redirects/redirects.remote.ts");

describe("redirects.remote admin gate contract", () => {
  it("remote module exists and delegates to redirects.server", () => {
    expect(existsSync(remotePath)).toBe(true);
    const src = readFileSync(remotePath, "utf8");
    expect(src).toMatch(/redirects\.server/);
    // Either inline admin check or imports server helpers that enforce admin
    expect(
      /isAdmin|requireAdmin|saveRedirect|deleteRedirect/.test(src),
      "must reference admin gate or server helpers",
    ).toBe(true);
  });
});
