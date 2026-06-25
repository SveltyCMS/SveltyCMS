/**
 * @file src/hooks/handle-static-asset-caching.ts
 * @description Hardened static asset caching — protects HMR in dev, safe header mutation.
 */

import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { MEDIA_RESOURCE_HEADERS } from "@utils/security-constants";

const IMMUTABLE_ASSET_REGEX =
  /^\/(?:_app\/|static\/|files\/|favicon\.ico|manifest\.webmanifest|apple-touch-icon.*\.png|robots\.txt|sitemap\.xml)|.*\.(?:js|css|map|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot)$/i;

const VITE_DEV_REGEX = /^\/(?:@vite\/|@fs\/|@id\/|\.svelte-kit\/|src\/|node_modules\/)/;

function isStaticAsset(pathname: string): boolean {
  if (VITE_DEV_REGEX.test(pathname)) return false;
  if (
    pathname.startsWith("/_app/") ||
    pathname.startsWith("/static/") ||
    pathname.startsWith("/files/")
  )
    return true;
  if (
    ["/favicon.ico", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml"].includes(pathname) ||
    pathname.startsWith("/apple-touch-icon")
  )
    return true;
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  if (match) {
    const exts = new Set([
      "js",
      "css",
      "map",
      "svg",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "avif",
      "woff",
      "woff2",
      "ttf",
      "eot",
    ]);
    return exts.has(match[1].toLowerCase());
  }
  return false;
}

export const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  // Skip Vite dev internals entirely to preserve HMR
  if (dev && VITE_DEV_REGEX.test(pathname)) return await resolve(event);

  if (IMMUTABLE_ASSET_REGEX.test(pathname)) {
    const response = await resolve(event);
    const mutableHeaders = new Headers(response.headers);
    mutableHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    if (pathname.startsWith("/files/")) {
      for (const [key, value] of Object.entries(MEDIA_RESOURCE_HEADERS)) {
        mutableHeaders.set(key, value);
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: mutableHeaders,
    });
  }

  return await resolve(event);
};

export { isStaticAsset };
export { IMMUTABLE_ASSET_REGEX as STATIC_ASSET_REGEX };
