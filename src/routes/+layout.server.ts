/**
 * @file src/routes/+layout.server.ts
 * @description SveltyCMS Root Layout Server Load
 *
 * - Detects locale prefix in the URL (e.g., /de/login).
 * - Sets the systemLanguage for the CMS GUI based on the URL or falls back to DEFAULT_SYSTEM_LANGUAGE.
 * - Used for hybrid localized and non-localized routing with Paraglide.
 */

import { publicEnv } from '@root/config/public';

export const load = async ({ url }) => {
    // Extract locale from the path, e.g., /de/login -> 'de', /login -> null
    const match = url.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const locale = match ? match[1] : publicEnv.DEFAULT_SYSTEM_LANGUAGE;

    return {
        systemLanguage: locale
    };
};
