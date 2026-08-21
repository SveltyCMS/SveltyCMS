/**
 * @file src/utils/security/session-cookie.ts
 * @description Dedicated, pure session cookie resolution and cleanup utilities.
 *
 * Provides:
 * - Cookie name prefix resolution (__Host-, __Secure-, and raw)
 * - Safe reader with protocol-aware precedence
 * - Multi-variant cookie deletion to prevent zombie session cookies
 */

import {
  HOST_SESSION_COOKIE_NAME,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@src/databases/auth/constants";

export interface CookieReader {
  get(name: string, opts?: any): string | undefined;
}

export interface CookieDeleter {
  delete(name: string, opts?: any): void;
}

/**
 * Reads the session cookie according to environment security requirements.
 *
 * - Secure connections: ONLY accept __Host- prefixed cookie (prevents subdomain cookie tossing)
 * - Insecure connections: ONLY accept unprefixed cookie (never fall back to __Host-)
 * - Unspecified: checks in standard precedence (__Host- -> raw -> __Secure-)
 */
export function readSessionCookie(
  cookies?: CookieReader | { get?: (name: string, ...args: any[]) => string | undefined } | null,
  isSecure?: boolean,
): string | undefined {
  if (!cookies || typeof cookies.get !== "function") return undefined;
  if (isSecure === true) {
    return (
      cookies.get(HOST_SESSION_COOKIE_NAME) ||
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(SECURE_SESSION_COOKIE_NAME)
    );
  }
  if (isSecure === false) {
    return (
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(HOST_SESSION_COOKIE_NAME) ||
      cookies.get(SECURE_SESSION_COOKIE_NAME)
    );
  }
  return (
    cookies.get(HOST_SESSION_COOKIE_NAME) ||
    cookies.get(SESSION_COOKIE_NAME) ||
    cookies.get(SECURE_SESSION_COOKIE_NAME)
  );
}

/**
 * Deletes all session cookie variants (__Host-, __Secure-, and plain) to ensure
 * clean session termination without leaving stale prefixed cookies.
 */
export function clearAllSessionCookies(
  cookies?: CookieDeleter | { delete?: (name: string, opts: any) => void } | null,
  cookiePathOrOptions:
    | string
    | {
        path?: string;
        isSecure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      } = "/",
): void {
  if (!cookies || typeof cookies.delete !== "function") return;
  const isString = typeof cookiePathOrOptions === "string";
  const cookiePath = isString ? cookiePathOrOptions : (cookiePathOrOptions?.path ?? "/");
  const isSecureOpt = !isString ? cookiePathOrOptions?.isSecure : undefined;
  const sameSiteOpt = !isString ? cookiePathOrOptions?.sameSite : undefined;
  const httpOnlyOpt =
    !isString && cookiePathOrOptions?.httpOnly !== undefined ? cookiePathOrOptions.httpOnly : true;

  const names = [HOST_SESSION_COOKIE_NAME, SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME];
  for (const name of names) {
    const isHostCookie = name.startsWith("__Host-");
    const isSecureCookie = name.startsWith("__Secure-");
    const mustBeSecure = isHostCookie || isSecureCookie || isSecureOpt === true;

    const effectiveSameSite =
      sameSiteOpt !== undefined ? sameSiteOpt : mustBeSecure ? "strict" : "lax";

    cookies.delete(name, {
      path: isHostCookie ? "/" : cookiePath,
      secure: mustBeSecure,
      httpOnly: httpOnlyOpt,
      sameSite: effectiveSameSite,
    });
  }
}
