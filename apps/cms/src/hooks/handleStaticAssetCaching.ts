/**
 * @file apps/cms/src/hooks/handleStaticAssetCaching.ts
 * @description Middleware that applies aggressive caching headers to static assets
 *
 * ### Purpose
 * Static assets (images, fonts, scripts, styles) are immutable and can be cached
 * indefinitely. This hook applies optimal caching headers to:
 * - Reduce server load and bandwidth
 * - Improve page load performance
 * - Leverage browser and CDN caching effectively
 *
 * ### Caching Strategy
 * - **max-age=31536000**: Cache for 1 year (maximum practical value)
 * - **public**: Allow CDNs and proxies to cache
 * - **immutable**: Tell browsers the asset will never change
 *
 * ### Assets Cached
 * - SvelteKit build artifacts (`/_app/`)
 * - User static files (`/static/`)
 * - Media files (`/files/`)
 * - JavaScript and CSS files (`.js`, `.css`)
 * - Images (`.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`)
 * - Fonts (`.woff`, `.woff2`, `.ttf`, `.eot`)
 * - Source maps (`.map`)
 * - Icons and manifests (`favicon.ico`, `manifest.webmanifest`, `apple-touch-icon.png`)
 *
 * ### Why This Hook Runs Early
 * Static assets don't need authentication, rate limiting, or other middleware.
 * By handling them early, we avoid unnecessary processing overhead.
 *
 * @prerequisite handleSystemState confirmed system is operational
 */

import type { Handle } from '@sveltejs/kit';

// --- ASSET DETECTION ---

/**
 * Comprehensive regex pattern to match all types of static assets.
 * Optimized for performance with specific path prefixes and file extensions.
 */
const STATIC_ASSET_REGEX =
	/^\/(?:_app\/|static\/|files\/|favicon\.ico|manifest\.webmanifest|apple-touch-icon.*\.png|robots\.txt|sitemap\.xml)|.*\.(?:js|css|map|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot)$/;

/**
 * Alternative function-based approach for more readable asset detection.
 * Use this if you prefer explicit logic over regex.
 *
 * @param pathname - The URL pathname to check
 * @returns True if the path represents a static asset
 */
function isStaticAsset(pathname: string): boolean {
	// Check path prefixes (most common, check first)
	if (pathname.startsWith('/_app/') || pathname.startsWith('/static/') || pathname.startsWith('/files/')) {
		return true;
	}

	// Check specific files
	if (
		pathname === '/favicon.ico' ||
		pathname === '/manifest.webmanifest' ||
		pathname === '/robots.txt' ||
		pathname === '/sitemap.xml' ||
		pathname.startsWith('/apple-touch-icon')
	) {
		return true;
	}

	// Check file extensions
	const ext = pathname.split('.').pop()?.toLowerCase();
	if (ext) {
		const staticExtensions = new Set([
			'js',
			'css',
			'map', // Scripts and styles
			'svg',
			'png',
			'jpg',
			'jpeg', // Images
			'gif',
			'webp',
			'avif', // Images (modern formats)
			'woff',
			'woff2',
			'ttf',
			'eot' // Fonts
		]);
		return staticExtensions.has(ext);
	}

	return false;
}

// --- MAIN HOOK ---

export const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	// Check if this is a static asset request
	// Using regex for performance (faster than function calls)
	if (STATIC_ASSET_REGEX.test(event.url.pathname)) {
		// Resolve the request to get the response
		const response = await resolve(event);

		// Apply aggressive caching headers
		// These headers tell browsers and CDNs to cache the asset for 1 year
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

		return response;
	}

	// Not a static asset - continue to next middleware
	return resolve(event);
};

// --- ALTERNATIVE EXPORTS ---

/**
 * Export the function-based approach for use in other contexts.
 * Useful for API endpoints or route guards that need to check asset types.
 */
export { isStaticAsset };

/**
 * Export the regex pattern for reuse in other hooks or utilities.
 */
export { STATIC_ASSET_REGEX };
