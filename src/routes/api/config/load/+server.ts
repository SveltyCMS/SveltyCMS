/**
 * @file src/routes/api/config/load/+server.ts
 * @description API endpoint to load the current configuration.
 *
 * ENHANCEMENT:
 * This version bypasses Node's ESM module cache by using a dynamic import()
 * with a cache-busting query parameter. This forces the server to re-read the
 * configuration files from the disk on every API call, ensuring the GUI always
 * gets the most up-to-date data, even immediately after a save operation.
 */
import { json } from '@sveltejs/kit';
import { pathToFileURL } from 'url';
import path from 'path';

// Auth

// Helper to construct a cache-busted path for dynamic import
function getFreshPath(modulePath) {
	// Convert a file system path to a file:// URL that import() can use
	const fileUrl = pathToFileURL(modulePath).href;
	// Append a unique query string to prevent caching
	return `${fileUrl}?v=${Date.now()}`;
}

export async function GET({ locals }) {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Resolve absolute paths from the project root directory
		const projectRoot = process.cwd();
		const privateConfigPath = path.join(projectRoot, 'config', 'private.ts');
		const publicConfigPath = path.join(projectRoot, 'config', 'public.ts');
		const guiConfigPath = path.join(projectRoot, 'config', 'guiConfig.ts');

		// Dynamically import the modules to get the latest versions from disk
		const { privateEnv } = await import(getFreshPath(privateConfigPath));
		const { publicEnv } = await import(getFreshPath(publicConfigPath));
		const { privateConfigCategories, publicConfigCategories } = await import(getFreshPath(guiConfigPath));

		// We can send all configs at once to be efficient
		const payload = {
			privateEnv,
			publicEnv,
			privateConfigCategories,
			publicConfigCategories
		};
		return json({ success: true, data: payload });
	} catch (error) {
		console.error('Failed to dynamically load configuration:', error);
		return json({ success: false, message: 'Could not load server configuration from disk.' }, { status: 500 });
	}
}
