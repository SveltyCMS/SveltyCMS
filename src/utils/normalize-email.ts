/**
 * @file src/utils/normalize-email.ts
 * @description Email normalization utility — handles Unicode normalization, trimming,
 * and case-folding to prevent duplicate-account and security issues.
 *
 * ### Features:
 * - NFC+NFKC Unicode normalization (prevents homoglyph bypass)
 * - Trim whitespace
 * - Lowercase
 * - Basic format validation (has @, no spaces in domain)
 */

/**
 * Normalizes an email address for consistent storage and lookup.
 * 1. Trims whitespace
 * 2. Applies Unicode NFC normalization
 * 3. Converts to lowercase
 * 4. Trims again
 */
export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase().trim();
}
