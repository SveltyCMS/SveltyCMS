/**
 * @file src/plugins/commerce/cart-session.ts
 * @description Guest cart cookie. Host-only, SameSite=strict. Session id is
 * opaque; tenant is NEVER stored in the cookie — lookups always use
 * `locals.tenantId`.
 *
 * ### Features:
 * - CSPRNG session ids
 * - __Host- prefix on secure connections
 */

import type { Cookies } from "@sveltejs/kit";
import { generateUUID } from "@utils/native-utils";
import { isSecureCookieContext } from "@src/databases/auth/constants";

const CART_COOKIE = "svelty-cart";
const MAX_AGE = 60 * 60 * 24 * 30;

export function cartCookieName(isSecure: boolean): string {
  return isSecure ? `__Host-${CART_COOKIE}` : CART_COOKIE;
}

export function readCartSessionId(cookies: Cookies, url: URL): string | undefined {
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  return cookies.get(cartCookieName(isSecure)) || cookies.get(CART_COOKIE);
}

export function ensureCartSessionId(cookies: Cookies, url: URL): string {
  const existing = readCartSessionId(cookies, url);
  if (existing) return existing;
  const sessionId = generateUUID();
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  cookies.set(cartCookieName(isSecure), sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: isSecure,
    maxAge: MAX_AGE,
  });
  return sessionId;
}

export function clearCartSessionId(cookies: Cookies, url: URL): void {
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  cookies.delete(cartCookieName(isSecure), { path: "/" });
  cookies.delete(CART_COOKIE, { path: "/" });
}
