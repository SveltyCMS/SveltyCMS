/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page.
 * It now protects the route from being accessed after setup is complete.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { version as pkgVersion } from '../../../package.json';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from '../../../project.inlang/settings.json';

/**
 * Check if setup is truly complete (not just file exists, but has valid values)
 */
function isSetupTrulyComplete(): boolean {
	try {
		const privateConfigPath = join(process.cwd(), 'config', 'private.ts');

		if (!existsSync(privateConfigPath)) {
			return false;
		}

		const configContent = readFileSync(privateConfigPath, 'utf8');

		// Check if essential values are filled (not empty strings)
		// Pattern matches: JWT_SECRET_KEY: '' or JWT_SECRET_KEY: ""
		const hasValidJwtSecret = configContent.includes('JWT_SECRET_KEY') && !/JWT_SECRET_KEY:\s*['"]{2}\s*[,}]/.test(configContent);
		const hasValidDbHost = configContent.includes('DB_HOST') && !/DB_HOST:\s*['"]{2}\s*[,}]/.test(configContent);
		const hasValidDbName = configContent.includes('DB_NAME') && !/DB_NAME:\s*['"]{2}\s*[,}]/.test(configContent);

		return hasValidJwtSecret && hasValidDbHost && hasValidDbName;
	} catch (error) {
		console.error('Error checking setup status:', error);
		return false;
	}
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// --- SECURITY ---
	// If setup is already complete (config has actual values), allow access to show success
	// The client will handle redirecting to CMS app
	// Don't redirect here as it would cause 404 errors

	// Clear any existing session cookies to ensure fresh start
	// This prevents issues when doing a fresh database setup
	cookies.delete('auth_session', { path: '/' });

	// Get available system languages from inlang settings (direct import, no parsing needed)
	const availableLanguages: string[] = inlangSettings.locales || ['en', 'de'];

	// Pass theme data and PKG_VERSION from server to client
	return {
		theme: locals.theme,
		darkMode: locals.darkMode,
		availableLanguages, // Pass the languages from settings.json
		settings: {
			PKG_VERSION: pkgVersion
		}
	};
};
