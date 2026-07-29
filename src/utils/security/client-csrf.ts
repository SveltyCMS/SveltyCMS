/**
 * @file src/utils/security/client-csrf.ts
 * @description Client-side CSRF header helpers for browser fetch mutations.
 */

/**
 * Build JSON headers with CSRF from page.data or document cookie.
 */
export function clientJsonHeaders(csrfToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let token = csrfToken || "";
  if (!token && typeof document !== "undefined") {
    const host = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
    const plain = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    token = host?.[1] || plain?.[1] || "";
    try {
      token = decodeURIComponent(token);
    } catch {
      /* keep raw */
    }
  }
  if (token) headers["X-CSRF-Token"] = token;
  return headers;
}
