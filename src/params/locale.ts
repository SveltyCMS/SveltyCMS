/**
 * @file src/params/locale.ts
 * @description
 * High-performance Param Matcher for SvelteKit route segments like `[language=locale]`.
 *
 * ### Why this is NOT redundant:
 * Even though Paraglide JS handles runtime translations, SvelteKit's routing system
 * requires this matcher to distinguish between a language segment (e.g., `/en/foo`)
 * and a potential static folder or another dynamic segment in the root directory.
 *
 * Without this, SvelteKit cannot correctly prioritize routes or provide 404s for
 * unsupported language prefixes.
 */

import type { ParamMatcher } from "@sveltejs/kit";

/**
 * Supported locales.
 * IMPORTANT: Keep this array in sync with your Paraglide configuration in `svelte.config.js`
 * and your message files. If a new language is added to the CMS, add it here.
 */
const LOCALES = ["en", "de"];

export const match: ParamMatcher = (param) => {
  return typeof param === "string" && LOCALES.includes(param.toLowerCase());
};
