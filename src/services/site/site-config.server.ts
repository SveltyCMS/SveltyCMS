/**
 * @file src/services/site/site-config.server.ts
 * @description Server helpers for the optional in-repo site starter.
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";

/** CMS paths that always require authentication (never public site routes). */
export const CMS_RESERVED_PREFIXES = [
  "/api",
  "/login",
  "/setup",
  "/dashboard",
  "/config",
  "/admin",
  "/share",
  "/email-previews",
  "/mediagallery",
  "/user",
  "/files",
  "/sitemap.xml",
  "/robots.txt",
] as const;

/** Matches admin language routes like /en or /en/collections/posts */
const ADMIN_LANGUAGE_ROUTE = /^\/[a-z]{2}(?:-[a-zA-Z]+)?(?:\/|$)/;

export function isSiteStarterEnabled(): boolean {
  const value: unknown = getPublicSettingSync("SITE_STARTER_ENABLED");
  // Opt-in. The starter seeds a public marketing homepage at `/`, so an
  // install that never asked for it (blank / content / commerce presets) must
  // fall through to `/login` instead of rendering that page.
  // Accept the raw string too: the cache normally holds a parsed boolean, but
  // rows written before the schema parse are stored as `"true"`.
  return value === true || value === "true";
}

export function isSiteStarterPublicPath(pathname: string): boolean {
  if (!isSiteStarterEnabled()) return false;

  if (CMS_RESERVED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }

  if (ADMIN_LANGUAGE_ROUTE.test(pathname)) return false;

  return true;
}

/** Maps URL path segments to the `pages` collection slug field. */
export function pathToPageSlug(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "home";
  return trimmed;
}
