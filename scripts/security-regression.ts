/**
 * @file scripts/security-regression.ts
 * @description
 * Single source of truth for the security regression unit suite.
 *
 * ### Ownership (never run twice in one commit→push cycle)
 * - **Pre-commit** runs this suite (fast fail before the commit lands).
 * - **Pre-push** must NOT re-run these files; Full Unit Tests exclude them.
 * - **Full precheck / CI whitebox** may run the broader unit suite including these.
 *
 * ### Features:
 * - shared file list for hooks and precheck exclude flags
 * - CLI entry: `bun run scripts/security-regression.ts`
 */

export const SECURITY_REGRESSION_FILES = [
  "tests/unit/hooks/defense-in-depth.test.ts",
  "tests/unit/hooks/authentication.test.ts",
  "tests/unit/hooks/authorization.test.ts",
  "tests/unit/auth/role-permission-access.test.ts",
  "tests/unit/hooks/setup.test.ts",
  "tests/unit/hooks/security-headers.test.ts",
] as const;

/** Comma-separated paths for `test-smart --exclude=...`. */
export function securityRegressionExcludeArg(): string {
  return SECURITY_REGRESSION_FILES.join(",");
}

// Bun CLI entry: `bun run scripts/security-regression.ts`
if (import.meta.main) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("bun", ["test", ...SECURITY_REGRESSION_FILES], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status === null ? 1 : result.status);
}
