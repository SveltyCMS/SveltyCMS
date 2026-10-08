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

// NOTE: constants.ts re-exports this module (circular import). The cookie-name
// constants must therefore be read at CALL time, never at module-eval time —
// under a constants-first evaluation order the imported names are still
// `undefined` while this module initializes. Lazy init keeps the steady-state
// per-call cost at zero while staying immune to import order.
// Needle order mirrors readSessionCookie precedence:
// secure: __Host- → plain → __Secure-; insecure: plain → __Host- → __Secure-.
let _secureNeedles: readonly string[] | undefined;
let _insecureNeedles: readonly string[] | undefined;

function secureNeedles(): readonly string[] {
  return (_secureNeedles ??= [
    `${HOST_SESSION_COOKIE_NAME}=`,
    `${SESSION_COOKIE_NAME}=`,
    `${SECURE_SESSION_COOKIE_NAME}=`,
  ]);
}

function insecureNeedles(): readonly string[] {
  return (_insecureNeedles ??= [
    `${SESSION_COOKIE_NAME}=`,
    `${HOST_SESSION_COOKIE_NAME}=`,
    `${SECURE_SESSION_COOKIE_NAME}=`,
  ]);
}

// Lazy per-variant facts for cookie cleanup (same circular-import rationale;
// also avoids per-call startsWith checks and the per-call names array).
let _sessionCookieVariants:
  | ReadonlyArray<{ name: string; isHost: boolean; isSecurePrefixed: boolean }>
  | undefined;

function sessionCookieVariants(): ReadonlyArray<{
  name: string;
  isHost: boolean;
  isSecurePrefixed: boolean;
}> {
  return (_sessionCookieVariants ??= [
    { name: HOST_SESSION_COOKIE_NAME, isHost: true, isSecurePrefixed: false },
    { name: SECURE_SESSION_COOKIE_NAME, isHost: false, isSecurePrefixed: true },
    { name: SESSION_COOKIE_NAME, isHost: false, isSecurePrefixed: false },
  ]);
}

export interface CookieReader {
  get(name: string, opts?: any): string | undefined;
}

export interface CookieDeleter {
  delete(name: string, opts?: any): void;
}

/**
 * Per-request WeakMap cache: memoizes resolved session cookies on the Request's
 * cookies instance to eliminate 4-6 repeated lookups across the middleware chain.
 */
const _cookieCache = new WeakMap<
  object,
  {
    secure?: string | null;
    insecure?: string | null;
    any?: string | null;
  }
>();

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

  const isObj = typeof cookies === "object" && cookies !== null;
  const modeKey = isSecure === true ? "secure" : isSecure === false ? "insecure" : "any";

  if (isObj) {
    const entry = _cookieCache.get(cookies as object);
    if (entry && entry[modeKey] !== undefined) {
      return entry[modeKey] ?? undefined;
    }
  }

  let result: string | undefined;
  if (isSecure === true) {
    result =
      cookies.get(HOST_SESSION_COOKIE_NAME) ||
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(SECURE_SESSION_COOKIE_NAME);
  } else if (isSecure === false) {
    result =
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(HOST_SESSION_COOKIE_NAME) ||
      cookies.get(SECURE_SESSION_COOKIE_NAME);
  } else {
    result =
      cookies.get(HOST_SESSION_COOKIE_NAME) ||
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(SECURE_SESSION_COOKIE_NAME);
  }

  if (isObj) {
    let entry = _cookieCache.get(cookies as object);
    if (!entry) {
      entry = {};
      _cookieCache.set(cookies as object, entry);
    }
    entry[modeKey] = result ?? null;
  }

  return result;
}

/**
 * Same precedence as `readSessionCookie`, reading the raw `Cookie` header once.
 * A name matches only at a cookie boundary (`start` or `;`), so
 * `my_auth_sessions_extra` does not match `auth_sessions`.
 */
export function readSessionIdFromCookieHeader(
  cookieHeader: string | null | undefined,
  isSecure: boolean,
): string | undefined {
  if (!cookieHeader) return undefined;
  const needles = isSecure === true ? secureNeedles() : insecureNeedles();
  for (let i = 0; i < needles.length; i++) {
    const value = cookieValueAtBoundary(cookieHeader, needles[i]!);
    if (value) return value;
  }
  return undefined;
}

function cookieValueAtBoundary(header: string, needle: string): string | undefined {
  let from = 0;
  while (from < header.length) {
    const idx = header.indexOf(needle, from);
    if (idx < 0) return undefined;
    let boundary = idx === 0;
    if (!boundary) {
      let j = idx - 1;
      while (j >= 0 && header.charCodeAt(j) === 32) j--;
      boundary = j < 0 || header.charCodeAt(j) === 59;
    }
    if (boundary) {
      const valueStart = idx + needle.length;
      let end = header.indexOf(";", valueStart);
      if (end < 0) end = header.length;
      const raw = header.slice(valueStart, end).trim();
      if (raw) return raw;
    }
    from = idx + needle.length;
  }
  return undefined;
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
  if (typeof cookies === "object") {
    _cookieCache.delete(cookies as object);
  }
  const isString = typeof cookiePathOrOptions === "string";
  const cookiePath = isString ? cookiePathOrOptions : (cookiePathOrOptions?.path ?? "/");
  const isSecureOpt = !isString ? cookiePathOrOptions?.isSecure : undefined;
  const sameSiteOpt = !isString ? cookiePathOrOptions?.sameSite : undefined;
  const httpOnlyOpt =
    !isString && cookiePathOrOptions?.httpOnly !== undefined ? cookiePathOrOptions.httpOnly : true;

  for (const variant of sessionCookieVariants()) {
    const mustBeSecure = variant.isHost || variant.isSecurePrefixed || isSecureOpt === true;

    const effectiveSameSite =
      sameSiteOpt !== undefined ? sameSiteOpt : mustBeSecure ? "strict" : "lax";

    cookies.delete(variant.name, {
      path: variant.isHost ? "/" : cookiePath,
      secure: mustBeSecure,
      httpOnly: httpOnlyOpt,
      sameSite: effectiveSameSite,
    });
  }
}
