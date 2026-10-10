/**
 * @src\components\ui\file-upload.svelte src/utils/security/csrf-utils.ts
 * @src\widgets\core\rich-text\components\image-description.svelte CSRF protection utilities implementing double-submit cookie pattern
 */

import { generateSecureToken } from "@utils/native-utils";
import type { Cookies } from "@sveltejs/kit";

export const CSRF_TOKEN_COOKIE_NAME = "csrf_token";
export const CSRF_TOKEN_HEADER = "X-CSRF-Token";
const CSRF_TOKEN_LENGTH = 32; // 256 bits
const CSRF_COOKIE_NAME_INSECURE = CSRF_TOKEN_COOKIE_NAME;
const CSRF_COOKIE_NAME_SECURE = "__Host-" + CSRF_TOKEN_COOKIE_NAME;
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

// Precomputed cookie option shapes — cookies.set() never mutates its options
// argument, so the two shapes are safe to share across calls and the per-call
// spread / template allocation disappears from the token hot path.
const CSRF_COOKIE_OPTS_SECURE = {
  path: "/",
  httpOnly: false,
  secure: true,
  sameSite: "strict" as const,
  maxAge: CSRF_COOKIE_MAX_AGE,
};
const CSRF_COOKIE_OPTS_INSECURE = {
  path: "/",
  httpOnly: false,
  secure: false,
  sameSite: "strict" as const,
  maxAge: CSRF_COOKIE_MAX_AGE,
  domain: undefined,
};

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Precomputed validation result objects — every consumer only reads
// `.isValid` / `.error`, so sharing the instances is safe.
const CSRF_RESULT_VALID = { isValid: true } as const;
const CSRF_RESULT_TOKEN_REQUIRED = { isValid: false, error: "CSRF token required" } as const;
const CSRF_RESULT_TOKEN_INVALID = { isValid: false, error: "Invalid CSRF token" } as const;

function isLoopbackHost(h: string): boolean {
  return h.startsWith("localhost") || h.startsWith("127.0.0.1") || h.startsWith("[::1]");
}

/**
 * Generates a new CSRF token and sets it as a cookie
 */
export function generateCsrfToken(cookies: Cookies, isSecure: boolean): string {
  const token = generateSecureToken(CSRF_TOKEN_LENGTH);

  cookies.set(
    isSecure ? CSRF_COOKIE_NAME_SECURE : CSRF_COOKIE_NAME_INSECURE,
    token,
    isSecure ? CSRF_COOKIE_OPTS_SECURE : CSRF_COOKIE_OPTS_INSECURE,
  );
  return token;
}

/**
 * Ensures a CSRF token exists in the cookies, generating one only if missing.
 */
export function ensureCsrfToken(cookies: Cookies, isSecure: boolean): string | null {
  const cookieName = isSecure ? CSRF_COOKIE_NAME_SECURE : CSRF_COOKIE_NAME_INSECURE;
  const existing = cookies.get(cookieName);

  if (!existing) {
    return generateCsrfToken(cookies, isSecure);
  }
  return existing;
}

/**
 * Validates a CSRF token against the cookie value with constant-time comparison.
 * Returns the validation result. On success, automatically rotates the token
 * to prevent replay attacks — the consumed token is invalidated and a fresh one
 * is issued in the same cookie.
 */
export function validateCsrfToken(
  cookies: Cookies,
  tokenToValidate?: string,
  isSecure?: boolean,
): boolean {
  const cookieName = isSecure ? CSRF_COOKIE_NAME_SECURE : CSRF_COOKIE_NAME_INSECURE;
  const cookieToken = cookies.get(cookieName);

  if (!cookieToken || !tokenToValidate || cookieToken.length !== tokenToValidate.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ tokenToValidate.charCodeAt(i);
  }

  const isValid = result === 0;

  // Rotate token on successful validation — single-use CSRF pattern
  if (isValid) {
    generateCsrfToken(cookies, isSecure ?? false);
  }

  return isValid;
}

/**
 * Middleware to validate CSRF token for state-changing operations
 */
export function validateCsrfForRequest(
  cookies: Cookies,
  request: Request,
  isSecure: boolean,
): { isValid: boolean; error?: string } {
  if (CSRF_SAFE_METHODS.has(request.method)) {
    return CSRF_RESULT_VALID;
  }

  // 🚀 SAME-ORIGIN FAST-PATH: SvelteKit's built-in CSRF already blocks cross-origin
  // requests. The custom X-CSRF-Token check is an additional defense layer for
  // cross-origin requests. Same-origin requests can skip the custom check.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    if (origin === `http://${host}` || origin === `https://${host}` || origin === `//${host}`) {
      return CSRF_RESULT_VALID;
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return CSRF_RESULT_VALID;
      }
      if (isLoopbackHost(originUrl.host) && isLoopbackHost(host)) {
        return CSRF_RESULT_VALID;
      }
    } catch {
      // Malformed origin — fall through to token check
    }
  }

  // 🚀 REFERER FALLBACK: When Origin header is absent (e.g., some FormData/fetch
  // combinations), check Referer against the Host.
  if (!origin && host) {
    const referer = request.headers.get("referer");
    if (referer) {
      if (
        referer === `http://${host}/` ||
        referer === `https://${host}/` ||
        referer.startsWith(`http://${host}/`) ||
        referer.startsWith(`https://${host}/`)
      ) {
        return CSRF_RESULT_VALID;
      }
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.host === host) {
          return CSRF_RESULT_VALID;
        }
      } catch {
        // Malformed referer — fall through to token check
      }
    }
  }

  // Get token from header
  const csrfToken = request.headers.get(CSRF_TOKEN_HEADER);
  if (!csrfToken) {
    return CSRF_RESULT_TOKEN_REQUIRED;
  }

  if (!validateCsrfToken(cookies, csrfToken, isSecure)) {
    return CSRF_RESULT_TOKEN_INVALID;
  }

  return CSRF_RESULT_VALID;
}
