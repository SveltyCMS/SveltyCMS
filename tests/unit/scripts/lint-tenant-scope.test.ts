/**
 * @file tests/unit/scripts/lint-tenant-scope.test.ts
 * @description Fixtures for `lint-tenant-scope` — flags an unconditional
 * `withSystemScope()` spread next to a live `tenantId`, allows the conditional
 * shape, and honors the line suppression comment.
 */

import { describe, expect, it } from "vitest";
import {
  findTenantScopeConflicts,
  type TenantScopeOffense,
} from "../../../scripts/lint/lint-tenant-scope";

function scan(path: string, source: string): TenantScopeOffense[] {
  return findTenantScopeConflicts([{ path, source }]);
}

describe("lint-tenant-scope", () => {
  it("flags an unconditional system scope next to a tenantId", () => {
    const offenses = scan(
      "src/content/example.server.ts",
      `const options = { tenantId, ...withSystemScope("bootstrap"), bypassCache: true };`,
    );
    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.line).toBe(1);
  });

  it("flags the property-assignment form", () => {
    const offenses = scan(
      "src/content/example.server.ts",
      `const options = { tenantId: tenantId as any, systemScope: withSystemScope("bootstrap") };`,
    );
    expect(offenses).toHaveLength(1);
  });

  it("allows the conditional spread", () => {
    const offenses = scan(
      "src/content/example.server.ts",
      `const options = { tenantId, ...(tenantId ? {} : withSystemScope("bootstrap")), bypassCache: true };`,
    );
    expect(offenses).toEqual([]);
  });

  it("allows a system scope when the object has no tenantId", () => {
    const offenses = scan(
      "src/content/example.server.ts",
      `const options = { ...withSystemScope("bootstrap"), bypassCache: true };`,
    );
    expect(offenses).toEqual([]);
  });

  it("honors the line suppression comment", () => {
    const offenses = scan(
      "src/content/example.server.ts",
      `// lint-tenant-scope: allow — reviewed global bootstrap read\nconst options = { tenantId, ...withSystemScope("bootstrap") };`,
    );
    expect(offenses).toEqual([]);
  });

  it("scans Svelte script blocks with the right line offset", () => {
    const offenses = scan(
      "src/routes/example/+page.svelte",
      `<script lang="ts">\n  const q = { tenantId, ...withSystemScope("bootstrap") };\n</script>\n<section></section>`,
    );
    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.line).toBe(2);
  });
});
