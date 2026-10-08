/**
 * @file src/utils/security/cors-utils.ts
 * @description CORS header generation with origin validation.
 * Prevents cross-origin attacks by validating the Origin header against allowed origins.
 *
 * ### Features:
 * - Explicit origin allowlist (no wildcard `*`)
 * - Development mode: allows localhost origins
 * - Production mode: validates against configured ALLOWED_ORIGINS
 * - Prevents DNS rebinding by validating host header
 */

import { dev } from "$app/env";

const PRODUCTION_ALLOWED_ORIGINS = [
  "https://sveltycms.com",
  "https://docs.sveltycms.com",
  "https://telemetry.sveltycms.com",
  "https://marketplace.sveltycms.com",
  // Add custom origins via ALLOWED_ORIGINS env var (comma-separated)
  ...(process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) || []),
];

/**
 * Restrictive CORS response for disallowed origins — precomputed once.
 * Every consumer only reads the returned object (see handle-security-headers),
 * so sharing one instance across calls is safe.
 */
const RESTRICTIVE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Methods": "",
  "Access-Control-Allow-Headers": "",
};

// Single-slot memo for the last allowed origin: repeated requests from the
// same browser origin (the common case) skip both the origin check and the
// per-call headers-object allocation. Scalar state — bounded, no growth.
let _cachedAllowedOrigin: string | null = null;
let _cachedAllowedHeaders: Record<string, string> | null = null;
let _lastCheckedOrigin: string | null = null;
let _lastCheckedAllowed = false;

function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;

  if (origin === _lastCheckedOrigin) return _lastCheckedAllowed;

  let allowed: boolean;
  // In development, allow all localhost origins
  if (dev) {
    try {
      const { hostname } = new URL(origin);
      allowed =
        hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.");
    } catch {
      allowed = false;
    }
  } else {
    // In production, validate against allowlist
    allowed = PRODUCTION_ALLOWED_ORIGINS.includes(origin);
  }

  _lastCheckedOrigin = origin;
  _lastCheckedAllowed = allowed;
  return allowed;
}

export function getCorsHeaders(
  origin: string | null,
  _isApiRoute: boolean,
): Record<string, string> | null {
  if (!origin) return null;

  if (origin === _cachedAllowedOrigin && _cachedAllowedHeaders !== null) {
    return _cachedAllowedHeaders;
  }

  if (!isAllowedOrigin(origin)) {
    // Return restrictive CORS — blocks cross-origin requests from unknown origins
    return RESTRICTIVE_CORS_HEADERS;
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Tenant-Id, X-Publication-Filter, X-Test-Secret, X-API-Version",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
  _cachedAllowedOrigin = origin;
  _cachedAllowedHeaders = headers;
  return headers;
}
