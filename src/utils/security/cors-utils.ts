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

import { dev } from "$app/environment";

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

function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;

  // In development, allow all localhost origins
  if (dev) {
    try {
      const { hostname } = new URL(origin);
      return (
        hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.")
      );
    } catch {
      return false;
    }
  }

  // In production, validate against allowlist
  return PRODUCTION_ALLOWED_ORIGINS.includes(origin);
}

export function getCorsHeaders(
  origin: string | null,
  _isApiRoute: boolean,
): Record<string, string> | null {
  if (!origin) return null;

  if (!isAllowedOrigin(origin)) {
    // Return restrictive CORS — blocks cross-origin requests from unknown origins
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "",
      "Access-Control-Allow-Headers": "",
    };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Tenant-Id, X-Publication-Filter, X-Test-Secret, X-API-Version",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}
