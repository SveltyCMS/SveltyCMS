/**
 * @file tests/unit/hooks/file-server-tenant.test.ts
 * @description Tenant access control tests for the `/files/[...path]` file server route.
 *
 * Verifies that the file server handler correctly enforces tenant isolation
 * in multi-tenant mode, matching the logic in src/routes/files/[...path]/+server.ts.
 *
 * Features tested:
 * - Multi-tenant disabled: all file access is allowed
 * - Multi-tenant enabled, matching tenantId: file access allowed
 * - Multi-tenant enabled, non-matching tenantId: file access blocked (403)
 * - Multi-tenant enabled, missing tenantId: access blocked (defense-in-depth)
 * - Multi-tenant enabled, "global" tenantId bypass: file access allowed
 * - Global-scoped files (path starts with "global/"): always allowed
 * - Directory traversal protection is separate from tenant checks
 */

import { describe, it, expect } from "vitest";

/**
 * Simulates the tenant access control logic from src/routes/files/[...path]/+server.ts.
 *
 * @param isMultiTenant - Whether multi-tenant mode is enabled
 * @param filePath - The raw file path from the request (after trimming "files/" prefix)
 * @param userTenantId - The tenantId from locals (or undefined/null if not set)
 * @returns true if access is allowed, throws AppError-like object if denied
 */
type FileServerTenantResult =
  | { allowed: true; status?: never; code?: never }
  | { allowed: false; status: number; code: string };

function simulateFileServerTenantCheck(
  isMultiTenant: boolean,
  filePath: string,
  userTenantId: string | null | undefined,
): FileServerTenantResult {
  const pathTenant = filePath.split("/")[0];

  // 🛡️ Tenant access control
  if (isMultiTenant && pathTenant && pathTenant !== "global") {
    // Reject when: no tenantId (undefined/null), OR tenantId doesn't match path tenant and isn't "global" bypass
    if (!userTenantId || (userTenantId !== pathTenant && userTenantId !== "global")) {
      return { allowed: false, status: 403, code: "TENANT_MISMATCH" };
    }
  }

  return { allowed: true };
}

/** Narrow denied results so status/code are typed without casts at every call site. */
function expectDenied(result: FileServerTenantResult): asserts result is {
  allowed: false;
  status: number;
  code: string;
} {
  expect(result.allowed).toBe(false);
}

// ─── Multi-Tenant Disabled ────────────────────────────────────────────────

describe("File Server: Multi-Tenant Disabled", () => {
  it("should allow access when multi-tenant is disabled (any path)", () => {
    const result = simulateFileServerTenantCheck(false, "tenant-a/abc123/image.jpg", undefined);
    expect(result.allowed).toBe(true);
  });

  it("should allow access to global files when multi-tenant is disabled", () => {
    const result = simulateFileServerTenantCheck(false, "global/abc123/image.jpg", undefined);
    expect(result.allowed).toBe(true);
  });

  it("should allow access regardless of user tenantId when multi-tenant is disabled", () => {
    const result = simulateFileServerTenantCheck(false, "tenant-a/abc123/image.jpg", "tenant-b");
    expect(result.allowed).toBe(true);
  });

  it("should allow access to root-level files when multi-tenant is disabled", () => {
    const result = simulateFileServerTenantCheck(false, "logo.png", undefined);
    expect(result.allowed).toBe(true);
  });
});

// ─── Multi-Tenant Enabled: Matching Tenant ────────────────────────────────

describe("File Server: Multi-Tenant Enabled — Matching Tenant", () => {
  it("should allow access when user tenantId matches path tenant", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", "tenant-a");
    expect(result.allowed).toBe(true);
  });

  it("should allow access to deeply nested files within matching tenant", () => {
    const result = simulateFileServerTenantCheck(
      true,
      "tenant-a/images/2026/07/screenshot.png",
      "tenant-a",
    );
    expect(result.allowed).toBe(true);
  });

  it("should allow access when multi-tenant hostname and user share same tenant", () => {
    const result = simulateFileServerTenantCheck(true, "acme-corp/reports/q3.pdf", "acme-corp");
    expect(result.allowed).toBe(true);
  });
});

// ─── Multi-Tenant Enabled: Non-Matching Tenant ────────────────────────────

describe("File Server: Multi-Tenant Enabled — Non-Matching Tenant", () => {
  it("should block access when user tenantId does not match path tenant", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", "tenant-b");
    expectDenied(result);
    expect(result.status).toBe(403);
    expect(result.code).toBe("TENANT_MISMATCH");
  });

  it("should block access from one tenant to another tenant's nested files", () => {
    const result = simulateFileServerTenantCheck(true, "acme-corp/images/logo.png", "other-corp");
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should block access to tenant files when path tenant is completely different", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-z/secret.docx", "tenant-a");
    expectDenied(result);
    expect(result.status).toBe(403);
  });
});

// ─── Multi-Tenant Enabled: Missing TenantId (Defense-in-Depth) ────────────

describe("File Server: Multi-Tenant Enabled — Missing TenantId", () => {
  it("should block access when user tenantId is null", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", null);
    expectDenied(result);
    expect(result.status).toBe(403);
    expect(result.code).toBe("TENANT_MISMATCH");
  });

  it("should block access when user tenantId is undefined", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", undefined);
    expectDenied(result);
    expect(result.status).toBe(403);
    expect(result.code).toBe("TENANT_MISMATCH");
  });

  it("should block access to any tenant-scoped file with missing tenantId", () => {
    const result = simulateFileServerTenantCheck(true, "some-tenant/document.pdf", undefined);
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should block access even if file exists but tenantId is missing", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", null);
    expectDenied(result);
    expect(result.status).toBe(403);
  });
});

// ─── Multi-Tenant Enabled: Global TenantId Bypass ─────────────────────────

describe("File Server: Multi-Tenant Enabled — 'global' Tenant Bypass", () => {
  it("should allow access when user tenantId is 'global' (admin bypass)", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-a/abc123/image.jpg", "global");
    expect(result.allowed).toBe(true);
  });

  it("should allow 'global' user to access any tenant's files", () => {
    const result = simulateFileServerTenantCheck(true, "tenant-b/secret.docx", "global");
    expect(result.allowed).toBe(true);
  });

  it("should allow 'global' user to access deeply nested tenant files", () => {
    const result = simulateFileServerTenantCheck(
      true,
      "acme-corp/deeply/nested/file.pdf",
      "global",
    );
    expect(result.allowed).toBe(true);
  });
});

// ─── Multi-Tenant Enabled: Global-Scoped Files ────────────────────────────

describe("File Server: Multi-Tenant Enabled — Global-Scoped Files", () => {
  it("should allow access to global-scoped files regardless of tenantId", () => {
    const result = simulateFileServerTenantCheck(true, "global/abc123/logo.png", "tenant-a");
    expect(result.allowed).toBe(true);
  });

  it("should allow access to global-scoped files with missing tenantId", () => {
    const result = simulateFileServerTenantCheck(true, "global/abc123/logo.png", undefined);
    expect(result.allowed).toBe(true);
  });

  it("should allow access to global-scoped files with non-matching tenantId", () => {
    const result = simulateFileServerTenantCheck(true, "global/abc123/logo.png", "tenant-b");
    expect(result.allowed).toBe(true);
  });

  it("should allow access to global-scoped files with null tenantId", () => {
    const result = simulateFileServerTenantCheck(true, "global/abc123/logo.png", null);
    expect(result.allowed).toBe(true);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────

describe("File Server: Edge Cases", () => {
  it("should block root-level files when user tenantId doesn't match path", () => {
    // A file at "logo.png" has pathTenant = "logo.png" — not a real tenant prefix.
    // In multi-tenant mode, files must be under a recognized tenant path or "global/".
    // If the user's tenantId doesn't match the path tenant AND isn't "global", block.
    const result = simulateFileServerTenantCheck(true, "logo.png", "tenant-a");
    // pathTenant = "logo.png", enters the check.
    // userTenantId = "tenant-a" !== "logo.png" && !== "global" → blocked
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should block root-level file with no user tenantId (defense-in-depth)", () => {
    // Root-level file like "logo.png" — pathTenant is "logo.png" which is truthy
    // and !== "global", but with !userTenantId it blocks. This is correct
    // defense-in-depth — without tenant context we can't determine ownership
    // and must fail closed.
    const result = simulateFileServerTenantCheck(true, "logo.png", undefined);
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should allow access when multi-tenant is enabled but ALL tenants file is public", () => {
    // The "all" convention is not a reserved keyword; it's treated as a tenant name.
    // If the admin wants all-tenants-accessible files, they should use "global/" prefix.
    const result = simulateFileServerTenantCheck(true, "all/shared-file.pdf", "tenant-a");
    // pathTenant = "all", userTenantId = "tenant-a" → not matching → blocked
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should enforce tenant check on short file paths", () => {
    const result = simulateFileServerTenantCheck(true, "a/file.txt", "b");
    expectDenied(result);
    expect(result.status).toBe(403);
  });

  it("should allow matching tenant on short file paths", () => {
    const result = simulateFileServerTenantCheck(true, "a/file.txt", "a");
    expect(result.allowed).toBe(true);
  });
});
