import { redirect, type Handle } from '@sveltejs/kit';
import { isSetupCompleteAsync } from '@shared/utils/setupCheck';
import { logger } from '@shared/utils/logger.server';

/**
 * Regex pattern to identify asset requests that should always be allowed.
 * These are essential for the setup page UI to render properly.
 */
const ASSET_REGEX =
	/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map))/;

// Checks if a pathname is an allowed route during setup.
export function isAllowedDuringSetup(pathname: string): boolean {
	// Allow standard setup, API setup, version check, assets, AND localized setup
	// AND allow root '/' since this is the standalone setup app
	return (
		pathname === '/' ||
		pathname.startsWith('/setup') ||
		/^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname) || // Localized setup (e.g. /en/setup)
		pathname.startsWith('/api/') ||
		pathname === '/api/system/version' ||
		ASSET_REGEX.test(pathname)
	);
}

/**
 * Creates a response resolver with special headers for setup mode.
 * This allows the setup API to set cookies (like admin session) before redirecting.
 */
function createSetupResolver() {
	return {
		filterSerializedResponseHeaders: (name: string) => {
			const lower = name.toLowerCase();
			return lower.startsWith('content-') || lower.startsWith('etag') || lower === 'set-cookie' || lower === 'cache-control';
		}
	};
}

export const handleSetup: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// --- Step 1: Check Setup Status ---
	// We use the cached/memoized check from utils.
	// This utility checks if the config exists AND if the database has admin users.
	if (event.locals.__setupConfigExists === undefined) {
		event.locals.__setupConfigExists = await isSetupCompleteAsync();
	}
	const isComplete = event.locals.__setupConfigExists;

	// --- Step 2: Handle Incomplete Setup ---
	if (!isComplete) {
		// Log warning only once per request flow to prevent spam
		// AND only if the user is attempting to access a non-setup route
		if (!event.locals.__setupLogged && !isAllowedDuringSetup(pathname)) {
			logger.warn('System requires initial setup.');
			event.locals.__setupLogged = true;
		}

		// Allow access to setup routes and assets
		if (isAllowedDuringSetup(pathname)) {
			return resolve(event, createSetupResolver());
		}

		// Redirect everything else to /
		if (!event.locals.__setupRedirectLogged) {
			logger.debug(`Redirecting ${pathname} to /`);
			event.locals.__setupRedirectLogged = true;
		}
		throw redirect(302, '/');
	}

	// --- Step 3: Handle Complete Setup ---
	// If setup is complete, BLOCK access to /setup routes (including localized ones)
	const isSetupRoute = pathname.startsWith('/setup') || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
	if (isSetupRoute && !pathname.includes('/api/setup')) {
		if (!event.locals.__setupLoginRedirectLogged) {
			logger.trace(`Setup complete. Blocking access to ${pathname}, redirecting to /login`);
			event.locals.__setupLoginRedirectLogged = true;
		}
		throw redirect(302, '/');
	}

	// Proceed normally
	return resolve(event);
};
