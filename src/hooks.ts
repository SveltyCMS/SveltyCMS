/**
 * @file src/hooks.server.ts
 * @description Paraglide Localized Routing Support for SveltyCMS
 *
 * This hook enables hybrid localized and non-localized routes:
 * - Strips locale prefixes (e.g., /de/login → /login) for internal routing.
 * - Allows both /login (uses DEFAULT_SYSTEM_LANGUAGE) and /de/login.
 * - Ensures SvelteKit and Paraglide SSR routing work as expected with your config.
 * - Does not affect contentLanguage/content translation logic.
 *
 * Adjust the import path if your Paraglide runtime is located elsewhere.
 */

import { deLocalizeUrl } from '@src/paraglide/runtime';

export const reroute = (request) => deLocalizeUrl(request.url).pathname;
