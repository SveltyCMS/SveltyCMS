/**
 * @file tests/unit/utils/tenant-module-boundary.test.ts
 * @description Guard for the tenant client/server split.
 *
 * `@utils/tenant` is **client-reachable** (`src/services/collaboration/sse-provider.svelte.ts`
 * runs in the browser). So it must not statically import private settings or any
 * `*.server.ts` module — SvelteKit would fail the client build, and `scan-secret-misuse.ts`
 * flags any private-key read outside a server module.
 *
 * The `MULTI_TENANT` flag and the `withTenant()` guard therefore live in
 * `tenant-isolation.server.ts`; this test fails if they leak back.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TENANT = join(ROOT, "src/utils/tenant.ts");
const TENANT_ISOLATION = join(ROOT, "src/utils/tenant-isolation.server.ts");

/** Symbols that require the private-setting read and must stay server-only. */
const SERVER_ONLY_SYMBOLS = ["isMultiTenantEnabled", "resetMultiTenantCache", "withTenant"];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Import specifiers used by static or dynamic imports, including `import("…")`. */
function specifiersOf(source: string): string[] {
  const specs: string[] = [];
  for (const re of [
    /(?:^|\n)\s*import\s+[^;'"]*from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+[^;'"]*from\s*["']([^"']+)["']/g,
  ]) {
    for (const match of source.matchAll(re)) specs.push(match[1]);
  }
  return specs;
}

describe("tenant module boundary (client-safe vs server-only)", () => {
  it("keeps @utils/tenant free of private settings and server-only modules", () => {
    const source = read(TENANT);
    const offenders = specifiersOf(source).filter(
      (spec) => spec.includes("services/core/settings-service") || /\.server(\.ts)?$/.test(spec),
    );

    expect(
      offenders,
      "src/utils/tenant.ts is imported by browser code — move the server-side logic to tenant-isolation.server.ts",
    ).toEqual([]);
  });

  it("does not re-export the private-flag API from @utils/tenant", () => {
    const leaked = SERVER_ONLY_SYMBOLS.filter((symbol) =>
      new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${symbol}\\b`).test(
        read(TENANT),
      ),
    );

    expect(leaked, "these symbols must only be exported by tenant-isolation.server.ts").toEqual([]);
  });

  it("reads MULTI_TENANT from a server-only module", () => {
    const source = read(TENANT_ISOLATION);

    expect(source).toContain('getPrivateSettingSync("MULTI_TENANT")');
    for (const symbol of SERVER_ONLY_SYMBOLS) {
      expect(source).toContain(symbol);
    }
  });
});
