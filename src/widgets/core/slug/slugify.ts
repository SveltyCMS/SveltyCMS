/**
 * @file src/widgets/core/slug/slugify.ts
 * @description Turn a title or name into a URL slug.
 *
 * Features:
 * - folds accents and ß
 * - keeps letters, numbers, hyphens, and underscores
 * - trims edge hyphens on the saved value
 */

/** Saved slug: no leading or trailing hyphen. */
export function slugify(input: string): string {
  return fold(input)
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

/** While typing, keep a trailing hyphen so "my-" can become "my-post". */
export function slugifyTyping(input: string): string {
  return fold(input).replace(/^-+/g, "").slice(0, 180);
}

function fold(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-");
}
