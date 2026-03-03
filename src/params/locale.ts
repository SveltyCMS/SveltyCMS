/**
 * @file src/params/locale.ts
 * @description Param matcher for route segment [language=locale]. Validates that the segment is a supported locale (Paraglide).
 */

import type { ParamMatcher } from '@sveltejs/kit';

/** Supported locales; keep in sync with Paraglide/Paraglide JS config (e.g. src/paraglide/runtime.js locales). */
const LOCALES = ['en', 'de'];

export const match: ParamMatcher = (param) => {
	return typeof param === 'string' && LOCALES.includes(param.toLowerCase());
};
