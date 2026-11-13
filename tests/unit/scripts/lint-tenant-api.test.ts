/**
 * @file tests/unit/scripts/lint-tenant-api.test.ts
 * @description AST rules of the tenant-isolation API linter
 * (`scripts/lint/lint-tenant-api.ts`): positional `tenantId` on adapter
 * surfaces, `bypassTenantCheck: true` outside the allowlist, the
 * `assertTenantContext(options ?? { … })` auto-bypass default, and the branded
 * scope exports. The allowlist is pinned as a per-file escape hatch — an
 * allowlisted path must never exempt a different file, and it never exempts the
 * auto-bypass default.
 */

import { describe, expect, it } from "vitest";

import {
  findAutoBypassViolations,
  findBypassTenantCheckViolations,
  findInterfaceTenantViolations,
  findPositionalTenantViolations,
  findScopeExportViolations,
  isAllowlistedPath,
} from "../../../scripts/lint/lint-tenant-api";

/** Joins fixture lines without a leading newline so line numbers stay obvious. */
function code(...lines: string[]): string {
  return lines.join("\n");
}

describe("positional tenantId on implementation files", () => {
  it("flags an optional positional tenantId with its line", () => {
    const violations = findPositionalTenantViolations(
      code(
        "export const findById = async (id: string, tenantId?: DatabaseId | null) => {",
        "  return id;",
        "};",
      ),
      "src/databases/core/relational-media.ts",
    );

    expect(violations).toEqual([
      {
        file: "src/databases/core/relational-media.ts:1",
        line: 1,
        message: "positional tenantId — use options?: BaseQueryOptions as last arg",
      },
    ]);
  });

  it("accepts the options bag as the last argument", () => {
    const violations = findPositionalTenantViolations(
      code(
        "export const findById = async (id: string, options?: BaseQueryOptions) => {",
        "  return id;",
        "};",
      ),
      "src/databases/core/relational-media.ts",
    );

    expect(violations).toEqual([]);
  });

  it("accepts a destructured tenantId bag", () => {
    const violations = findPositionalTenantViolations(
      "export const findById = async ({ tenantId }: { tenantId: DatabaseId }) => tenantId;",
      "src/databases/mongodb/media-methods.ts",
    );

    expect(violations).toEqual([]);
  });

  it("does not let a trailing options bag exempt an earlier positional tenantId", () => {
    const violations = findPositionalTenantViolations(
      code(
        "export const findById = async (tenantId?: DatabaseId | null, options?: BaseQueryOptions) => {",
        "  return options;",
        "};",
      ),
      "src/databases/core/relational-content.ts",
    );

    expect(violations.map((violation) => violation.line)).toEqual([1]);
  });

  it("ignores a non-optional tenantId and a non-union type", () => {
    const violations = findPositionalTenantViolations(
      code(
        "export const a = async (tenantId: DatabaseId) => tenantId;",
        "export const b = async (tenantId?: TenantContext) => tenantId;",
      ),
      "src/databases/core/relational-auth.ts",
    );

    expect(violations).toEqual([]);
  });
});

describe("adapter interface declarations", () => {
  it("flags a positional tenantId in a target adapter interface", () => {
    const violations = findInterfaceTenantViolations(
      code(
        "export interface IMediaAdapter {",
        "  findById(id: string, tenantId?: DatabaseId | null): Promise<unknown>;",
        "}",
      ),
      "src/databases/db-interface.ts",
    );

    expect(violations).toEqual([
      {
        file: "src/databases/db-interface.ts:2",
        line: 2,
        message: "positional tenantId — use options?: BaseQueryOptions",
      },
    ]);
  });

  it("accepts the options bag and ignores non-target interfaces", () => {
    const violations = findInterfaceTenantViolations(
      code(
        "export interface IMediaAdapter {",
        "  findById(id: string, options?: BaseQueryOptions): Promise<unknown>;",
        "}",
        "export interface IOtherAdapter {",
        "  findById(id: string, tenantId?: DatabaseId | null): Promise<unknown>;",
        "}",
      ),
      "src/databases/db-interface.ts",
    );

    expect(violations).toEqual([]);
  });
});

describe("bypassTenantCheck allowlist", () => {
  const BYPASS = `export function list() { return run({ bypassTenantCheck: true }); }`;

  it("flags bypassTenantCheck: true in product code", () => {
    const violations = findBypassTenantCheckViolations(BYPASS, "src/services/content-service.ts");

    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("src/services/content-service.ts:1");
    expect(violations[0].message).toContain("withSystemScope");
  });

  it("accepts the value false and a file without the field", () => {
    expect(
      findBypassTenantCheckViolations(
        "return run({ bypassTenantCheck: false });",
        "src/services/content-service.ts",
      ),
    ).toEqual([]);
    expect(
      findBypassTenantCheckViolations("return run({});", "src/services/content-service.ts"),
    ).toEqual([]);
  });

  it("exempts only allowlisted paths", () => {
    expect(isAllowlistedPath("src/routes/login/+page.server.ts")).toBe(true);
    expect(isAllowlistedPath("src\\routes\\login\\+page.server.ts")).toBe(true);
    expect(isAllowlistedPath("src/services/content-service.ts")).toBe(false);

    expect(findBypassTenantCheckViolations(BYPASS, "src/routes/login/+page.server.ts")).toEqual([]);
    // A path that merely starts with the same segment is NOT allowlisted.
    expect(
      findBypassTenantCheckViolations(BYPASS, "src/routes/login-proof/+page.server.ts"),
    ).toHaveLength(1);
  });
});

describe("auto-bypass defaults", () => {
  it("flags assertTenantContext(options ?? { bypassTenantCheck: true })", () => {
    const violations = findAutoBypassViolations(
      "export const ctx = () => assertTenantContext(options ?? { bypassTenantCheck: true });",
      "src/databases/mongodb/theme-methods.ts",
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("auto-bypass default");
  });

  it("accepts an explicit context and never consults the bypass allowlist", () => {
    expect(
      findAutoBypassViolations(
        "export const ctx = () => assertTenantContext(options);",
        "src/databases/mongodb/theme-methods.ts",
      ),
    ).toEqual([]);

    // The rule-2 allowlist must not silence this rule in an allowlisted file.
    expect(
      findAutoBypassViolations(
        "assertTenantContext(options ?? { bypassTenantCheck: true });",
        "src/routes/login/+page.server.ts",
      ),
    ).toHaveLength(1);
  });
});

describe("branded scope exports", () => {
  it("reports a missing module", () => {
    expect(findScopeExportViolations(null)).toEqual([
      {
        file: "src/databases/system-tenant-scope.ts",
        line: 0,
        message: "missing branded system scope module",
      },
    ]);
  });

  it("names every missing export", () => {
    const violations = findScopeExportViolations(
      code("export function createSystemTenantScope() {}", "export function withSystemScope() {}"),
    );

    expect(violations.map((violation) => violation.message)).toEqual([
      "missing export function isSystemTenantScope",
      "missing export function hasTenantBypass",
    ]);
  });

  it("accepts a module that exports every helper", () => {
    const violations = findScopeExportViolations(
      code(
        "export function createSystemTenantScope() {}",
        "export function isSystemTenantScope() {}",
        "export function hasTenantBypass() {}",
        "export function withSystemScope() {}",
      ),
    );

    expect(violations).toEqual([]);
  });
});
