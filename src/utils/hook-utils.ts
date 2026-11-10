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
import { getTrustedProxies } from "@src/databases/config-state";

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
  "/api/auth/sso-providers",
  "/api/auth/frontchannel-logout",
  "/api/auth/backchannel-logout",
  "/api/preview",
  "/api/media/share",
  "/api/system/penalize-bounce",
  "/api/system/prewarm-route",
  "/api/security/csp-report",
  "/api/auth/saml/acs",
  "/api/auth/saml/login",
  // Single Logout: the IdP drives these, so the CMS session (if any) is not a
  // precondition. Both terminate nothing until the SAML message's signature
  // verifies.
  "/api/auth/saml/slo",
  "/api/auth/saml/logout",
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
  "/api/forms",
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
  const existing = locals.__flags;
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

  locals.__flags = flags;
  return flags;
}

export function getRequestFlags(locals: App.Locals): RequestFlags {
  const existing = locals.__flags;
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

type ProxyRule =
  | { kind: "exact"; value: string }
  | { kind: "v4"; base: number; mask: number }
  | { kind: "v6"; base: bigint; prefix: number };

/** Compiled rules per cached allowlist array — the array identity is stable per config stamp. */
interface CompiledProxyRules {
  rules: ProxyRule[];
  /** False when every entry is an exact address — then no IP parsing is needed at all. */
  hasCidr: boolean;
}
const compiledProxyRules = new WeakMap<string[], CompiledProxyRules>();

function parseIpv4(ip: string): number | null {
  // Allocation-free scan: this runs for every request whose direct peer is checked,
  // and the split()+regex version alone cost ~100 ns per call in the measurement.
  let out = 0;
  let part = 0;
  let digits = 0;
  let parts = 0;

  for (let i = 0; i < ip.length; i++) {
    const c = ip.charCodeAt(i);
    if (c === 46) {
      if (digits === 0) return null;
      out = ((out << 8) | part) >>> 0;
      part = 0;
      digits = 0;
      parts++;
      continue;
    }
    if (c < 48 || c > 57) return null;
    part = part * 10 + (c - 48);
    digits++;
    if (digits > 3 || part > 255) return null;
  }

  if (digits === 0 || parts !== 3) return null;
  return ((out << 8) | part) >>> 0;
}

function parseIpv6(ip: string): bigint | null {
  const zone = ip.indexOf("%");
  const clean = zone === -1 ? ip : ip.slice(0, zone);
  if (!clean.includes(":")) return null;

  const halves = clean.split("::");
  if (halves.length > 2) return null; // more than one "::" is invalid

  const expand = (part: string): string[] | null => {
    if (!part) return [];
    const out: string[] = [];
    for (const group of part.split(":")) {
      // An empty group is a stray ":" — only "::" may omit groups.
      if (group === "") return null;
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(group);
    }
    return out;
  };

  const head = expand(halves[0]);
  if (!head) return null;
  const tail = halves.length === 2 ? expand(halves[1]) : [];
  if (!tail) return null;

  let groups: string[];
  if (halves.length === 2) {
    // "::" must stand for at least one zero group: eight explicit groups plus "::"
    // is not a valid address, and a negative fill count used to throw a RangeError.
    const omitted = 8 - head.length - tail.length;
    if (omitted < 1) return null;
    groups = [...head, ...Array.from({ length: omitted }, () => "0"), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let out = 0n;
  for (const g of groups) out = (out << 16n) | BigInt(parseInt(g, 16));
  return out;
}

/** Normalises an IPv4-mapped IPv6 address (`::ffff:10.0.0.5`) to plain IPv4. */
function normaliseIp(ip: string): string {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:") && lower.includes(".")) return lower.slice(7);
  return lower;
}

function parseProxyRule(entry: string): ProxyRule {
  const value = entry.trim().toLowerCase();
  const slash = value.indexOf("/");
  if (slash === -1) return { kind: "exact", value: normaliseIp(value) };

  let address = value.slice(0, slash);
  const prefix = Number(value.slice(slash + 1));
  let v4Prefix = prefix;

  // `::ffff:a.b.c.d/N` — an IPv4 block written in mapped-IPv6 form.
  if (address.startsWith("::ffff:") && address.includes(".")) {
    address = address.slice(7);
    v4Prefix = prefix - 96;
  }

  const v4 = parseIpv4(address);
  if (v4 !== null) {
    if (!Number.isInteger(v4Prefix) || v4Prefix < 0 || v4Prefix > 32) {
      return { kind: "exact", value };
    }
    const mask = v4Prefix === 0 ? 0 : (0xffffffff << (32 - v4Prefix)) >>> 0;
    // `v4 & mask` is a signed int32; keep the comparison unsigned or every
    // address with the high bit set (172.x, 192.x) fails to match.
    return { kind: "v4", base: (v4 & mask) >>> 0, mask };
  }

  const v6 = parseIpv6(address);
  if (v6 !== null) {
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return { kind: "exact", value };
    return { kind: "v6", base: v6, prefix };
  }

  return { kind: "exact", value };
}

/**
 * True when `ip` matches the proxy allowlist. Entries are exact addresses or CIDR
 * blocks — the documented contract. The previous implementation used
 * `list.includes(ip)`, so `TRUSTED_PROXIES=10.0.0.0/8` (or any `172.16.0.0/12`)
 * silently trusted nothing and every request fell back to the socket address.
 */
export function isTrustedProxyIp(ip: string, list: string[] | "all"): boolean {
  if (list === "all") return true;
  if (list.length === 0) return false;

  const candidate = normaliseIp(ip);
  let compiled = compiledProxyRules.get(list);
  if (!compiled) {
    const rules = list.map(parseProxyRule);
    compiled = { rules, hasCidr: rules.some((r) => r.kind !== "exact") };
    compiledProxyRules.set(list, compiled);
  }

  // Common deployment: an explicit list of proxy addresses. String comparison only.
  if (!compiled.hasCidr) {
    for (const rule of compiled.rules) {
      if (rule.kind === "exact" && rule.value === candidate) return true;
    }
    return false;
  }

  const v4 = parseIpv4(candidate);
  const v6 = v4 === null ? parseIpv6(candidate) : null;

  for (const rule of compiled.rules) {
    if (rule.kind === "exact") {
      if (rule.value === candidate) return true;
      continue;
    }
    if (rule.kind === "v4") {
      if (v4 !== null && (v4 & rule.mask) >>> 0 === rule.base) return true;
      continue;
    }
    if (v6 !== null) {
      const shift = BigInt(128 - rule.prefix);
      if (v6 >> shift === rule.base >> shift) return true;
    }
  }

  return false;
}

function isProxyTrusted(ip: string): boolean {
  // getTrustedProxies() caches the parsed allowlist against the config stamp
  // (config-state), so a changed TRUSTED_PROXIES setting takes effect without
  // a restart. The previous module-level Set here was never invalidated.
  return isTrustedProxyIp(ip, getTrustedProxies());
}

/**
 * High-performance client IP detection.
 * 🛡️ If getClientAddress fails, returns "0.0.0.0" to prevent IP spoofing.
 * When behind a reverse proxy, forwarded headers (cf-connecting-ip, x-real-ip,
 * x-forwarded-for) are only trusted if the direct connection originates from a
 * host listed in TRUSTED_PROXIES.
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

  let rawIp = "0.0.0.0";
  try {
    rawIp = event.getClientAddress();
  } catch (err: any) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.debug(
        `[getClientIp] Failed: ${err.message}. Defaulting to 0.0.0.0 to prevent IP spoofing.`,
      );
    }
  }

  let finalIp = rawIp;

  // 🛡️ TRUSTED_PROXIES: Only inspect forwarded headers if the direct socket connection
  // originates from an explicitly trusted reverse proxy (Nginx, ALB, Cloudflare).
  if (rawIp !== "0.0.0.0" && isProxyTrusted(rawIp)) {
    const cfIp = event.request.headers.get("cf-connecting-ip");
    const realIp = event.request.headers.get("x-real-ip");
    const fwdFor = event.request.headers.get("x-forwarded-for");

    if (cfIp) {
      finalIp = cfIp.trim();
    } else if (realIp) {
      finalIp = realIp.trim();
    } else if (fwdFor) {
      const parts = fwdFor.split(",");
      const candidate = parts[0]?.trim();
      if (candidate) finalIp = candidate;
    }
  }

  if (locals) locals.__clientIp = finalIp;
  return finalIp;
}

/**
 * Probe whether a `Headers` instance accepts mutations. SvelteKit `resolve()`
 * responses expose immutable Headers whose `set()` throws `TypeError: Headers
 * are immutable`; the exception is contained in this one helper so the caller
 * can branch on a boolean instead of using the throw as control flow.
 */
function headersAreMutable(headers: Headers): boolean {
  const probe = "x-svelty-mutable-probe";
  try {
    const hadProbe = headers.has(probe);
    const previous = hadProbe ? headers.get(probe) : null;
    headers.set(probe, "1");
    if (hadProbe && previous !== null) headers.set(probe, previous);
    else headers.delete(probe);
    return true;
  } catch {
    return false;
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
  // Mutable path: mutate in place (zero allocations). Immutable path: clone once.
  if (headersAreMutable(response.headers)) {
    mutate(response.headers);
    return response;
  }

  const headers = new Headers(response.headers);
  mutate(headers);
  const fastBody = (response as unknown as { __fastBody?: string | Uint8Array }).__fastBody;
  // Uint8Array is a valid BodyInit at runtime; the DOM lib's generic
  // ArrayBufferLike (which can be SharedArrayBuffer) is what makes the
  // direct assignment fail type-checking.
  const bodyInit = (fastBody ?? response.body) as BodyInit | null;
  const cloned = new Response(bodyInit, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (fastBody !== undefined) {
    (cloned as unknown as { __fastBody?: string | Uint8Array }).__fastBody = fastBody;
  }
  return cloned;
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

  // 3. Token access — explicit allowlist (zero allocation, no regex backtracking).
  // ONLY the read-only validation flow is public: GET /api/token/validate-token/:value
  // (the handler serves this action for GET only — see handlers/tokens.ts).
  // The previous deny-list shape treated every other /api/token/* path as public,
  // so PUT/DELETE /api/token/:id skipped the middleware gate AND the dispatcher's
  // endpoint-permission map (`api:token`), letting any session mutate tokens
  // (CWE-862 authorization bypass → account takeover via user_id re-pointing).
  if (pathname.startsWith("/api/token/")) {
    if (pathname.startsWith("/api/token/validate-token/")) return true;
    return false;
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
