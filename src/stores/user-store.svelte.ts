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
  if (url.startsWith("data:") || /^https?:\/\//i.test(url)) return url;
  if (/^\/?Default_User\.svg$/i.test(url)) return DEFAULT_AVATAR;
  const normalized = url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "/");
  if (normalized.startsWith("/files/")) return normalized;
  return normalized.startsWith("/") ? normalized : "/files/" + normalized;
}
