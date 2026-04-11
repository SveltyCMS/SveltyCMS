/**
 * @file src/utils/slugify.ts
 * @description Advanced string slugification utility
 *
 * Handles special characters, diacritics, and edge cases to generate
 * clean, URL-safe identifiers regardless of the source language.
 */

export interface SlugifyOptions {
  replacement?: string; // Replace spaces with replacement character, defaults to `-`
  remove?: RegExp; // Remove characters that match regex, defaults to `undefined`
  lower?: boolean; // Result in lower case, defaults to `true`
  strict?: boolean; // Strip special characters except replacement, defaults to `true`
  trim?: boolean; // Trim leading and trailing replacement chars, defaults to `true`
}

/**
 * Converts a string into a URL/identifier safe slug.
 * Removes diacritics, normalizes Unicode, and strips unwanted characters.
 *
 * @param string - The string to slugify
 * @param options - Slugify configuration options
 * @returns The slugified string
 */
export function slugify(string: string, options: SlugifyOptions = {}): string {
  if (typeof string !== "string") {
    return "";
  }

  const replacement = options.replacement ?? "-";
  const lower = options.lower ?? true;
  const strict = options.strict ?? true;
  const trim = options.trim ?? true;

  // Normalize string (decompose characters to base + combining character)
  // and remove diacritics using regex
  let slug = string.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (options.remove) {
    slug = slug.replace(options.remove, "");
  }

  if (lower) {
    slug = slug.toLowerCase();
  }

  // Replace spaces, underscores, and other separators with the replacement char
  slug = slug.replace(/[_.\s]+/g, replacement);

  if (strict) {
    // Only keep alphanumeric characters and the replacement character itself
    const safeReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const strictRegex = new RegExp(`[^a-z0-9${safeReplacement}]`, "gi");
    slug = slug.replace(strictRegex, "");
  }

  // Remove multiple sequential replacements
  const multiReplaceRegex = new RegExp(
    `(${replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}){2,}`,
    "g",
  );
  slug = slug.replace(multiReplaceRegex, replacement);

  if (trim) {
    // Remove leading and trailing replacements
    if (slug.startsWith(replacement)) {
      slug = slug.slice(replacement.length);
    }
    if (slug.endsWith(replacement)) {
      slug = slug.slice(0, -replacement.length);
    }
  }

  return slug;
}
