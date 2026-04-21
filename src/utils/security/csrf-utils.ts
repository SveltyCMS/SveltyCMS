/**
 * @src\components\ui\file-upload.svelte src/utils/security/csrf-utils.ts
 * @src\widgets\core\rich-text\components\image-description.svelte CSRF protection utilities implementing double-submit cookie pattern
 */

import { generateSecureToken } from "@utils/native-utils";
import type { Cookies } from "@sveltejs/kit";

export const CSRF_TOKEN_COOKIE_NAME = "csrf_token";
export const CSRF_TOKEN_HEADER = "X-CSRF-Token";
const CSRF_TOKEN_LENGTH = 32; // 256 bits

/**
 * Generates a new CSRF token and sets it as a cookie
 */
export function generateCsrfToken(cookies: Cookies, isSecure: boolean): string {
  const token = generateSecureToken(CSRF_TOKEN_LENGTH);
  const cookieName = isSecure ? `__Host-${CSRF_TOKEN_COOKIE_NAME}` : CSRF_TOKEN_COOKIE_NAME;

  cookies.set(cookieName, token, {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    ...(isSecure ? {} : { domain: undefined }),
  });
  return token;
}

/**
 * Ensures a CSRF token exists in the cookies, generating one only if missing.
 */
export function ensureCsrfToken(cookies: Cookies, isSecure: boolean): string | null {
  const cookieName = isSecure ? `__Host-${CSRF_TOKEN_COOKIE_NAME}` : CSRF_TOKEN_COOKIE_NAME;
  const existing = cookies.get(cookieName);

  if (!existing) {
    return generateCsrfToken(cookies, isSecure);
  }
  return existing;
}

/**
 * Validates a CSRF token against the cookie value with constant-time comparison
 */
export function validateCsrfToken(
  cookies: Cookies,
  tokenToValidate?: string,
  isSecure?: boolean,
): boolean {
  const cookieName = isSecure ? `__Host-${CSRF_TOKEN_COOKIE_NAME}` : CSRF_TOKEN_COOKIE_NAME;
  const cookieToken = cookies.get(cookieName);

  if (!cookieToken || !tokenToValidate || cookieToken.length !== tokenToValidate.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ tokenToValidate.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Middleware to validate CSRF token for state-changing operations
 */
export function validateCsrfForRequest(
  cookies: Cookies,
  request: Request,
  isSecure: boolean,
): { isValid: boolean; error?: string } {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(request.method)) {
    return { isValid: true };
  }

  // Get token from header
  const csrfToken = request.headers.get(CSRF_TOKEN_HEADER);
  if (!csrfToken) {
    return { isValid: false, error: "CSRF token required" };
  }

  if (!validateCsrfToken(cookies, csrfToken, isSecure)) {
    return { isValid: false, error: "Invalid CSRF token" };
  }

  return { isValid: true };
}
