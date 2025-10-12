/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page.
 * It now protects the route from being accessed after setup is complete.
 */

import { isSetupComplete } from '@utils/setupCheck';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// --- SECURITY ---
	// If setup is already complete, redirect the user away immediately.
	// This is the primary protection for this route.
	if (isSetupComplete()) {
		throw redirect(302, '/login');
	}

	// Clear any existing session cookies to ensure fresh start
	// This prevents issues when doing a fresh database setup
	cookies.delete('auth_session', { path: '/' });

	// Read package.json version
	let pkgVersion = '0.0.0';
	try {
		const packageJsonPath = path.resolve(__dirname, '../../../package.json');
		console.log('Resolved package.json path:', packageJsonPath);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
		pkgVersion = packageJson.version || '0.0.0';
		console.log('Loaded version:', pkgVersion);
	} catch (err) {
		console.error('Error reading package.json:', err);
		pkgVersion = '0.0.0';
	}

	// Pass theme data and PKG_VERSION from server to client
	return {
		theme: locals.theme,
		darkMode: locals.darkMode,
		settings: {
			PKG_VERSION: pkgVersion
		}
	};
};
