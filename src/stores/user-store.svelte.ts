/**
 * @file src/stores/user-store.svelte.ts
 * @description User-related utilities.
 *
 * Avatar URL: use `$derived(data.user?.avatar ?? '/Default_User.svg')` from page data.
 * This file only exports the normalizeAvatarUrl utility function.
 */

export function normalizeAvatarUrl(url: string | null | undefined): string {
  const DEFAULT_AVATAR = "/Default_User.svg";
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith("data:")) return url;
  // Strip protocol and host from absolute URLs
  let path = url.replace(/^https?:\/\/[^/]+/i, "");
  // Handle Default_User.svg variants
  if (/^\/?Default_User\.svg$/i.test(path)) return DEFAULT_AVATAR;
  // Normalize leading slashes (multiple → single)
  path = path.replace(/^\/+/, "/") || "/";
  // If it already starts with /files/ or is just root, return as-is
  if (path.startsWith("/files/") || path === "/") return path;
  // If it starts with a slash, it's an absolute path — return as-is
  if (path.startsWith("/")) return path;
  // Handle paths starting with "files/" (prepend just /)
  if (path.startsWith("files/")) return "/" + path;
  // Handle mediaFolder (treat as absolute path)
  if (path.startsWith("mediaFolder")) return "/" + path;
  // Otherwise, prepend /files/
  return "/files/" + path;
}
