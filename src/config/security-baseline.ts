/**
 * @file src/config/security-baseline.ts
 * @description
 * Git-versioned immutable security baseline configuration for SveltyCMS.
 *
 * Defines hard security floors enforced at runtime via BaselineGuard in CPU memory.
 * Ensures DB setting downgrades cannot compromise system security boundaries.
 *
 * ### Features:
 * - Immutable baseline security floors
 * - Password complexity requirements
 * - Session cookie security standards
 * - Disallowed unsafe upload file extensions
 */

export interface SecurityBaseline {
  minPasswordLength: number;
  requirePasswordSpecialChar: boolean;
  maxFailedLoginAttempts: number;
  accountLockoutMinutes: number;
  cookieSameSite: "strict" | "lax" | "none";
  cookieHttpOnly: boolean;
  cookieSecureInProd: boolean;
  disallowedFileExtensions: string[];
  maxUploadSizeBytes: number;
}

export const securityBaseline: SecurityBaseline = {
  minPasswordLength: 10,
  requirePasswordSpecialChar: true,
  maxFailedLoginAttempts: 5,
  accountLockoutMinutes: 15,
  cookieSameSite: "strict",
  cookieHttpOnly: true,
  cookieSecureInProd: true,
  disallowedFileExtensions: [
    "exe",
    "bat",
    "cmd",
    "sh",
    "php",
    "phtml",
    "phar",
    "cgi",
    "pl",
    "py",
    "jsp",
    "asp",
    "aspx",
    "dll",
    "scr",
    "vbs",
    "js",
    "cjs",
    "mjs",
  ],
  maxUploadSizeBytes: 100 * 1024 * 1024, // 100MB hard baseline cap
};
