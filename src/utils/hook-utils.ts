/**
 * @file src/utils/hook-utils.ts
 * @description High-performance utility for middleware hook short-circuiting and response generation.
 *
 * ### Hardening (audit 2026-07):
 * - IP spoofing prevention: fallback to "0.0.0.0" instead of untrusted x-forwarded-for
 * - ReDoS fix: split regex into INTERNAL_PATH_REGEX + anchored STATIC_EXT_REGEX
 * - O(1) Set lookup for 80% of public routes (replaces array scan)
 * - IS_TEST_MODE IIFE at module load (zero repeated globalThis lookups)
 * - Token validation uses regex capture group (zero allocation)
 */

import { logger } from "@utils/logger";
import { isSiteStarterPublicPath } from "@src/services/site/site-config.server";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { BASE_HEADERS } from "./security/constants";
import { isSetupComplete } from "./setup-check-fast";

// 🚀 Pre-cache to avoid Object.entries allocation and per-iteration filtering on every request
const STATIC_BASE_HEADER_PAIRS = Object.entries(BASE_HEADERS).filter(
  ([k]) => k !== "Content-Security-Policy",
);

// 🚀 Cache static environment flag at module load.
// SINGLE source of truth for middleware test-mode detection (was duplicated with
// divergent env sets in handle-security / handle-rate-limit). NOTE: deliberately
// NOT production-gated — the E2E preview servers rely on these flags even when
// NODE_ENV is unset/"production". The /api/testing gate in test-bypass.server.ts
// keeps its own stricter production hard-gate. BENCHMARK is deliberately absent:
// benchmark runs must exercise real middleware, not test-mode shortcuts.
export const IS_TEST_MODE = (() => {
  if (typeof globalThis === "undefined") return false;
  const env = (globalThis as any).process?.env;
  return (
    env?.TEST_MODE === "true" || env?.VITE_TEST_MODE === "true" || env?.PLAYWRIGHT_TEST === "true"
  );
})();

/** Mutation verbs that must run CSRF + cache invalidation. */
export const MUTATION_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Route-resource skip names declared on `RouteResourceSpec.skipMiddlewares`.
 * Hooks self-skip via `shouldSkipRouteMiddleware` — pipelines are cached, so
 * the sequence cannot drop handlers per request.
 */
export type SkipMiddlewareName = "media" | "preferences" | "scim" | "collaboration";

/**
 * True when `event.locals.routeSpec` lists this middleware as skippable
 * (bootstrap/login/setup lanes). O(n) over a 2–4 item array.
 */
export function shouldSkipRouteMiddleware(
  locals: { routeSpec?: { skipMiddlewares?: readonly string[] } } | null | undefined,
  name: SkipMiddlewareName,
): boolean {
  const list = locals?.routeSpec?.skipMiddlewares;
  if (!list || list.length === 0) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === name) return true;
  }
  return false;
}

/** Body-bearing verbs (field-write guard, payload size limit). */
export const WRITE_HTTP_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * GraphQL is almost always POST, including read-only queries. Treating those
 * POSTs as mutations wipes the GraphQL response cache on every query.
 * Empty/missing query is treated as read (fail-open for cache; Yoga still rejects).
 */
export function isGraphqlReadOperation(query: string | null | undefined): boolean {
  if (!query) return true;
  const trimmed = query.trim().toLowerCase();
  return !trimmed.startsWith("mutation") && !trimmed.startsWith("subscription");
}

/** Standardized user ID string extraction for cache key isolation. */
export function getUserCacheId(user: { _id?: unknown; id?: unknown } | null | undefined): string {
  if (!user) return "";
  const rawId = user._id ?? user.id;
  return rawId != null ? String(rawId) : "";
}

/** Builds a user-isolated cache key for API and Turbo GET responses. */
export function buildUserCacheKey(pathname: string, search: string, userId: string): string {
  if (!userId) return `${pathname}${search}`;
  return `${pathname}${search}:u:${userId}`;
}

/**
 * True for a single-entity API GET: `/api/(collections|content)/<coll>/<id>`.
 * These are high-cardinality (one key per document) — their responses stay in
 * the bounded turbo L1 only, never the shared 500k L1, so collection cache
 * invalidation never degrades to an O(#docs) scan of the response namespace.
 */
export function isPerEntityApiPath(pathname: string): boolean {
  return /^\/api\/(?:collections|content)\/[^/]+\/[^/]+/.test(pathname);
}

// ─── Pre-compiled classification matchers ─────────────────────────────────

export const INTERNAL_PATH_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|\.svelte-kit\/generated\/client\/nodes)/;

/** Anchored to end ($) to prevent catastrophic backtracking (ReDoS). */
export const STATIC_EXT_REGEX =
  /\.(?:svg|png|jpg|jpeg|gif|css|js|mjs|cjs|woff|woff2|ttf|eot|map|json|ico|pdf|txt|xml|webmanifest)$/i;

/** @deprecated Split into INTERNAL_PATH_REGEX + STATIC_EXT_REGEX (anchored to prevent ReDoS).
 * Kept for backward compatibility — legacy single regex matching both internal paths and extensions. */
export const STATIC_ASSET_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|files\/|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;

// Locale prefixes are 2–5 letters (e.g. /en/setup). MUST NOT match reserved CMS
// segments: `/api` is 3 letters and previously made /api/setup/* "public" via this
// regex — enabling unauthenticated setup complete (CWE-306 admin takeover).
const LOCALIZED_BOOTSTRAP_REGEX =
  /^\/(?!api(?:\/|$))[a-z]{2,5}(?:-[a-zA-Z]+)?\/(?:setup|login|register)(?:\/|$|\?)/;
const LOCALIZED_PUBLIC_REGEX =
  /^\/(?!api(?:\/|$))[a-z]{2,5}(?:-[a-zA-Z]+)?\/(?:setup|login|register|forgot-password)(?:\/|$|\?)/;

// O(1) Set lookup for 80% of public routes
const PUBLIC_EXACT_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/setup",
  "/share",
  "/api/system/health",
  "/api/system/version",
  "/api/user/login",
  "/api/user/2fa/verify",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/oidc-logout",
  "/api/auth/oidc-login",
  "/api/auth/oidc-callback",
  "/api/auth/frontchannel-logout",
  "/api/auth/backchannel-logout",
  "/api/preview",
  "/api/media/share",
  "/api/system/penalize-bounce",
  "/api/system/prewarm-route",
  "/api/security/csp-report",
  "/api/auth/saml/acs",
  "/api/auth/saml/login",
]);

const PUBLIC_PREFIX_ROUTES = [
  "/api/settings/public",
  "/api/theme/public",
  "/share",
  "/api/commerce/cart",
  "/api/commerce/quote",
  "/api/commerce/coupon",
  "/api/commerce/checkout",
  "/api/commerce/pay",
  "/api/commerce/confirm",
  "/api/commerce/panes",
  "/api/commerce/downloads",
  "/api/stripe/webhook",
  "/api/stripe/config",
];

/**
 * Public route prefixes/paths for audits and docs.
 * Prefer isPublicRoute()/isBootstrapRoute() at runtime (O(1) Set + prefix checks).
 */
export const PUBLIC_ROUTES: readonly string[] = [
  ...PUBLIC_EXACT_ROUTES,
  ...PUBLIC_PREFIX_ROUTES,
  "/api/auth",
  "/api/system",
  "/register",
  "/login",
  "/setup",
];

// ─── One-shot request classifier ──────────────────────────────────────────

export interface RequestFlags {
  isStatic: boolean;
  isApi: boolean;
  isBootstrap: boolean;
  isPublic: boolean;
  isTestMode: boolean;
}

export function classifyRequest(pathname: string, locals: App.Locals): RequestFlags {
  const existing = (locals as any).__flags as RequestFlags | undefined;
  if (existing) return existing;

  const isStatic = isStaticOrInternalRequest(pathname);
  const isBootstrap = isBootstrapRoute(pathname);
  // 🛡️ After install, /api/setup/* is NOT a public bootstrap surface.
  // Treating completed setup APIs as public enabled CWE-306 admin-takeover PoCs
  // (unauthenticated POST /api/setup/complete → session cookie).
  // First-time install (no private.ts) still marks /api/setup as public via bootstrap.
  const setupApiLocked = pathname.startsWith("/api/setup") && isSetupComplete();

  const flags: RequestFlags = {
    isStatic,
    isApi: pathname.startsWith("/api/"),
    isBootstrap,
    // Remote functions are self-guarding (each `.remote.ts` fn calls
    // getAuthenticatedUser/requireUser/requirePagePermission), so authz must
    // not gate the transport itself — same contract as public routes.
    isPublic:
      isStatic ||
      (isBootstrap && !setupApiLocked) ||
      pathname.startsWith("/_app/remote/") ||
      isPublicRoute(pathname, IS_TEST_MODE),
    isTestMode: IS_TEST_MODE,
  };

  (locals as any).__flags = flags;
  return flags;
}

export function getRequestFlags(locals: App.Locals): RequestFlags {
  const existing = (locals as any).__flags as RequestFlags | undefined;
  if (existing) return existing;

  return {
    isStatic: false,
    isApi: false,
    isBootstrap: false,
    isPublic: false,
    isTestMode: IS_TEST_MODE,
  };
}

// ─── Path classification ──────────────────────────────────────────────────

export function isStaticOrInternalRequest(pathname: string): boolean {
  if (pathname.length < 2) return false;
  if (pathname.startsWith("/api/")) return false;
  // `/_app/remote/*` are SvelteKit remote-function transports (dynamic server
  // code) — NOT static. They must pass through the auth/RBAC middleware so
  // auth-gated remote functions see `locals.user`. Static assets under
  // `/_app/immutable/` etc. stay fast-static.
  if (
    pathname.startsWith("/files/") ||
    pathname.startsWith("/.well-known/") ||
    (pathname.startsWith("/_") && !pathname.startsWith("/_app/remote/"))
  )
    return true;

  // `INTERNAL_PATH_REGEX` also matches `/_app…` — exclude the remote-function
  // transport there too (same rationale as the `/_` branch above).
  return (
    (INTERNAL_PATH_REGEX.test(pathname) && !pathname.startsWith("/_app/remote/")) ||
    STATIC_EXT_REGEX.test(pathname)
  );
}

export function isApiLike(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.includes("/api-");
}

export { isAdmin } from "@src/databases/auth/constants";

/**
 * High-performance client IP detection.
 * 🛡️ If getClientAddress fails, returns "0.0.0.0" to prevent IP spoofing via
 * untrusted X-Forwarded-For / X-Real-IP headers.
 *
 * Memoized per request on `event.locals` — the IP is resolved at most once
 * across the security → rate-limit → auth hook chain instead of calling the
 * platform adapter 3–5× per request.
 */
export function getClientIp(event: RequestEvent): string {
  if (IS_TEST_MODE) return "127.0.0.1";

  const locals = event.locals as Record<string, any>;
  const cached = locals?.__clientIp;
  if (cached) return cached;

  try {
    const ip = event.getClientAddress();
    if (locals) locals.__clientIp = ip;
    return ip;
  } catch (err: any) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.debug(
        `[getClientIp] Failed: ${err.message}. Defaulting to 0.0.0.0 to prevent IP spoofing.`,
      );
    }
    return "0.0.0.0";
  }
}

/**
 * Clone a SvelteKit/upstream Response into a new one with mutable headers.
 * `resolve()` responses often expose immutable Headers — mutating them throws
 * `TypeError: Headers are immutable`. Always use this before setting headers.
 */
export function withMutableHeaders(
  response: Response,
  mutate: (headers: Headers) => void,
): Response {
  const headers = new Headers(response.headers);
  mutate(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Whether the client prefers a JSON error body over HTML.
 * Used by rate-limit / security middleware so API clients don't get HTML 429/5xx pages.
 */
export function prefersJsonResponse(event: RequestEvent): boolean {
  if (event.url.pathname.startsWith("/api/")) return true;
  const accept = event.request.headers.get("Accept") || "";
  if (!accept || accept === "*/*") return false;
  const jsonIdx = accept.indexOf("application/json");
  if (jsonIdx === -1) return false;
  const htmlIdx = accept.indexOf("text/html");
  return htmlIdx === -1 || jsonIdx < htmlIdx;
}

export function isBootstrapRoute(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/setup") || pathname.startsWith("/api/setup"))
    return true;
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/user/login")
  )
    return true;

  if (
    pathname.startsWith("/api/system") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/testing") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/content/version") ||
    pathname.startsWith("/api/dashboard/health") ||
    pathname.startsWith("/ui-test")
  )
    return true;

  if (
    !pathname.startsWith("/api/") &&
    (pathname.startsWith("/_") ||
      pathname.startsWith("/static") ||
      pathname.startsWith("/assets") ||
      pathname.startsWith("/favicon.ico") ||
      pathname.startsWith("/.well-known") ||
      STATIC_EXT_REGEX.test(pathname))
  )
    return true;

  return LOCALIZED_BOOTSTRAP_REGEX.test(pathname);
}

export function isPublicRoute(pathname: string, testMode = false): boolean {
  // 1. O(1) Exact match
  if (PUBLIC_EXACT_ROUTES.has(pathname)) return true;

  // 2. Prefix match
  for (let i = 0; i < PUBLIC_PREFIX_ROUTES.length; i++) {
    if (pathname.startsWith(PUBLIC_PREFIX_ROUTES[i])) return true;
  }

  if (isSiteStarterPublicPath(pathname)) return true;
  if (testMode && pathname.startsWith("/api/testing")) return true;

  // 3. Token access (regex capture — zero allocation)
  if (pathname.startsWith("/api/token/")) {
    const tokenMatch = pathname.match(/^\/api\/token\/([^/]+)/);
    if (tokenMatch) {
      const action = tokenMatch[1];
      if (
        action !== "list" &&
        action !== "batch" &&
        action !== "create-token" &&
        action !== "resolve"
      ) {
        return true;
      }
    }
  }

  // 4. Localized routes + OAuth
  return (
    LOCALIZED_PUBLIC_REGEX.test(pathname) ||
    (pathname.includes("/login?") && pathname.includes("OAuth"))
  );
}

// ─── Response generation ──────────────────────────────────────────────────

export function applySecurityHeaders(headers: Headers, isHttps: boolean) {
  for (let i = 0; i < STATIC_BASE_HEADER_PAIRS.length; i++) {
    const pair = STATIC_BASE_HEADER_PAIRS[i];
    headers.set(pair[0], pair[1]);
  }

  if (isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

export function restrictedResponse(
  state: string,
  isApi: boolean,
  baseHeaders: Record<string, string>,
): Response {
  const status = 503;
  const isInit = state === "INITIALIZING";
  const message = isInit ? "System is initializing." : "System error or maintenance.";

  if (isApi) {
    return json({ error: message, state }, { status, headers: baseHeaders });
  }

  const html = isInit
    ? `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"><title>Initializing</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8fafc;color:#334155;} .loader{border:4px solid #e2e8f0;border-top:4px solid #3b82f6;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin-right:15px;} @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></head><body><div class="loader"></div><h2>System is starting up...</h2></body></html>`
    : `<!DOCTYPE html><html><head><title>System Maintenance</title></head><body><h2>${message}</h2></body></html>`;

  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Retry-After", "2");

  return new Response(html, { status, headers });
}

export function boundaryResponse(error: any, isHttps: boolean): Response {
  const status = error.status || 500;
  const message = error.message || "Internal Server Error";

  const headers = new Headers({ "Content-Type": "application/json" });
  applySecurityHeaders(headers, isHttps);

  return json({ error: message, code: error.code || "INTERNAL_ERROR" }, { status, headers });
}
