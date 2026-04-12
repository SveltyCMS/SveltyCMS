/**
 * @file src/utils/hook-utils.ts
 * @description High-performance utility for middleware hook short-circuiting.
 */

/**
 * Compiled regular expression for all static assets and internal Vite/SvelteKit routes.
 */
export const ASSET_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;

/**
 * Common public routes that bypass authentication and authorization.
 */
export const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/setup",
  "/api/settings/public",
  "/api/system/health",
  "/api/system/version",
  "/api/user/login",
  "/api/auth/login",
  "/api/preview",
  "/api/openapi.json",
  "/forbidden",
];

/**
 * Checks if a pathname is a static asset or internal system route.
 */
export function isStaticOrInternalRequest(pathname: string): boolean {
  if (pathname.length < 2) return false;
  if (pathname.startsWith("/.well-known/") || pathname.startsWith("/_")) return true;
  return ASSET_REGEX.test(pathname);
}

/**
 * Checks if a pathname is a public route or matches a localized/OAuth public route pattern.
 * @param pathname - The request URL pathname
 * @param testMode - Whether system is in test mode
 * @returns boolean - True if the route is public
 */
export function isPublicRoute(pathname: string, testMode = false): boolean {
  // 1. Prefix match against common public routes (fastest)
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) return true;

  if (testMode && pathname.startsWith("/api/testing")) return true;

  // Security and Auth Public Endpoints
  if (pathname === "/api/security/csp-report") return true;
  if (pathname === "/api/auth/saml/acs" || pathname === "/api/auth/saml/login") return true;

  // Invitation token validation is public (GET specific token)
  // Protected: /api/token/list, /api/token/batch, /api/token/create-token, /api/token/resolve
  // Public: /api/token/some-random-id-here
  if (pathname.startsWith("/api/token/")) {
    const parts = pathname.split("/").filter(Boolean);
    // Only /api/token/<id> is public, not /api/token or /api/token/action
    if (parts.length === 3) {
      const action = parts[2];
      const reserved = ["list", "batch", "create-token", "resolve"];
      if (!reserved.includes(action)) {
        return true;
      }
    }
  }

  // 2. Localized routes (e.g. /en/login) + Precise OAuth flow detection
  return (
    /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register|forgot-password)/.test(pathname) ||
    (pathname.includes("/login?") && pathname.includes("OAuth"))
  );
}
