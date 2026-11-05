/**
 * @file src/routes/(app)/dashboard/widget-sandbox.ts
 * @description Security sandbox for dashboard widgets: safe fetcher, endpoint validation, and isolation.
 *
 * Features:
 * - Strict URL validation restricting widget fetch requests to internal safe /api/ routes
 * - Automatic CSRF header injection via clientJsonHeaders
 * - Request timeout and hanging-promise abort protection
 * - Header sanitization preventing token smuggling and credential leakage
 * - Role/permission gating for sensitive widgets
 */

import { clientJsonHeaders } from "@utils/security/client-csrf";
import { logger } from "@utils/logger";
import { isAdmin } from "@src/databases/auth/constants";

const FORBIDDEN_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];
const DEFAULT_TIMEOUT_MS = 15_000;
const FALLBACK_ORIGIN = "http://widget-sandbox.invalid";

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/**
 * Decode percent-encoding until it stabilises, then reject any dot-segment or
 * backslash that survived. A single `decodeURIComponent` is not enough:
 * `%252e%252e` decodes to `%2e%2e`, which a second decoder (proxy, server
 * normaliser) would turn into `..` again.
 */
function normalisePathname(pathname: string): string | null {
  let current = pathname;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) break;
    current = next;
  }
  if (hasControlCharacters(current)) return null;
  if (current.includes("\\")) return null;
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(current)) return null;
  return current;
}

/**
 * Validates whether an endpoint is safe for a widget to call.
 * Only internal relative `/api/...` endpoints are permitted in the widget sandbox.
 *
 * The URL is parsed *before* the pathname check so encoded traversal
 * (`/api/%2E%2E/%2E%2E/admin`) cannot slip through a literal `startsWith` test.
 */
export function isValidDashboardEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string") return false;
  const trimmed = endpoint.trim();
  if (!trimmed) return false;
  if (hasControlCharacters(trimmed)) return false;

  // Prevent protocol-relative URLs (e.g., //evil.com)
  if (trimmed.startsWith("//")) return false;

  // Prevent explicit dangerous schemes
  const lower = trimmed.toLowerCase();
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (lower.startsWith(scheme)) return false;
  }

  const browserOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : FALLBACK_ORIGIN;

  let url: URL;
  try {
    url = new URL(trimmed, browserOrigin);
  } catch {
    return false;
  }

  // Absolute URLs are only allowed on the current origin (client-side).
  if (typeof window !== "undefined" && url.origin !== browserOrigin) return false;
  if (typeof window === "undefined" && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  if (url.username || url.password) return false;

  const pathname = normalisePathname(url.pathname);
  if (!pathname || !pathname.startsWith("/api/")) return false;

  // The public API surface only exposes GET-style widget reads; reject
  // endpoints that resolve into an auth or admin route by traversal.
  return pathname.length > "/api/".length;
}

/** HTTP failure with the status preserved so callers can avoid retrying 4xx. */
export class WidgetHttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string, endpoint: string) {
    super(`HTTP ${status}: ${statusText || "Request failed"} (${endpoint})`);
    this.name = "WidgetHttpError";
    this.status = status;
  }

  get retryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/**
 * Sandboxed fetcher for dashboard widgets.
 * Validates the endpoint, adds CSRF headers, applies a timeout, and prevents credential leakage.
 */
export async function sandboxedWidgetFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  externalSignal?: AbortSignal,
): Promise<T> {
  if (!isValidDashboardEndpoint(endpoint)) {
    const errorMsg = `[Widget Sandbox Security] Forbidden endpoint: "${endpoint}". Widgets may only request internal /api/ routes.`;
    logger.warn(errorMsg);
    throw new Error(errorMsg);
  }

  // Timeout controller to prevent hung widgets
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Widget request timed out after ${DEFAULT_TIMEOUT_MS}ms`));
  }, DEFAULT_TIMEOUT_MS);

  // Link external signal if provided; the listener is removed in `finally`
  // so a long-lived signal cannot retain every request controller.
  const onExternalAbort = externalSignal
    ? () => controller.abort(externalSignal.reason)
    : undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw externalSignal.reason ?? new Error("Request aborted");
    }
    externalSignal.addEventListener("abort", onExternalAbort!, { once: true });
  }

  // Sanitize headers: merge CSRF headers, strip sensitive host/auth spoofing.
  // `HeadersInit` may be a Headers instance or a tuple array, so normalise it
  // first — casting a Headers object to Record silently dropped every header.
  const sanitizedHeaders = new Headers(clientJsonHeaders());
  if (options.headers) {
    for (const [key, val] of new Headers(options.headers).entries()) {
      const lowerKey = key.toLowerCase();
      // Do not allow widgets to spoof host, authorization, or cookie headers
      if (
        lowerKey === "host" ||
        lowerKey === "cookie" ||
        lowerKey === "authorization" ||
        lowerKey === "origin"
      ) {
        continue;
      }
      sanitizedHeaders.set(key, val);
    }
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: sanitizedHeaders,
      signal: controller.signal,
      cache: options.cache ?? "no-store",
    });

    if (!response.ok) {
      throw new WidgetHttpError(response.status, response.statusText, endpoint);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    const textData = await response.text();
    return textData as unknown as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn(`[Widget Sandbox] Request aborted for endpoint: ${endpoint}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Checks if the current user has permission to view or execute a widget.
 */
export function checkWidgetAccess(
  user: { role?: string; isAdmin?: boolean; permissions?: string[] } | undefined,
  requiresPermission?: string,
  requiresAdmin?: boolean,
): boolean {
  if (!user) return false;
  // Canonical helper: handles SQLite `1`/`"1"` admin flags and super-admin.
  if (isAdmin(user)) return true;
  if (requiresAdmin) return false;
  if (!requiresPermission) return true;

  const permissions = user.permissions || [];
  if (permissions.includes("system:admin")) return true;
  if (permissions.includes(requiresPermission)) return true;

  // `dashboard:read` and `system:dashboard` are aliases for the same surface
  // (see databases/auth/dashboard-access.ts). A widget declaring either one
  // must be visible to a role seeded with the other.
  if (requiresPermission === "dashboard:read") {
    return permissions.includes("system:dashboard");
  }
  if (requiresPermission === "system:dashboard") {
    return permissions.includes("dashboard:read");
  }
  return false;
}
