import { error } from '@sveltejs/kit';
const ALLOWED_PROVIDERS = {
	simpleicons: {
		baseUrl: 'https://cdn.simpleicons.org',
		// Maps: /api/icon-proxy/simpleicons/github → https://cdn.simpleicons.org/github
		transform: (path) => `${path}`
	},
	iconify: {
		baseUrl: 'https://api.iconify.design',
		// Maps: /api/icon-proxy/iconify/mdi:account → https://api.iconify.design/mdi/account.svg
		transform: (path) => {
			const [collection, icon] = path.split(':');
			return `${collection}/${icon}.svg`;
		}
	}
	// Add more providers as needed:
	// lucide: { baseUrl: 'https://unpkg.com/lucide-static@latest/icons', transform: (path) => `${path}.svg` },
	// heroicons: { baseUrl: 'https://cdn.jsdelivr.net/npm/heroicons@2.0.18/24/outline', transform: (path) => `${path}.svg` }
};
const iconCache = /* @__PURE__ */ new Map();
const CACHE_TTL = 1e3 * 60 * 60 * 24;
const GET = async ({ params, fetch }) => {
	const fullPath = params.path;
	if (!fullPath) {
		throw error(400, 'Icon path is required');
	}
	const [provider, ...iconPathParts] = fullPath.split('/');
	const iconPath = iconPathParts.join('/');
	if (!provider || !(provider in ALLOWED_PROVIDERS)) {
		throw error(400, `Invalid icon provider. Allowed: ${Object.keys(ALLOWED_PROVIDERS).join(', ')}`);
	}
	if (!iconPath) {
		throw error(400, 'Icon path is required');
	}
	const providerConfig = ALLOWED_PROVIDERS[provider];
	const cacheKey = `${provider}:${iconPath}`;
	const cached = iconCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data.clone();
	}
	const transformedPath = providerConfig.transform(iconPath);
	const externalUrl = `${providerConfig.baseUrl}/${transformedPath}`;
	try {
		const response = await fetch(externalUrl, {
			headers: {
				'User-Agent': 'SveltyCMS-IconProxy/1.0'
			}
		});
		if (!response.ok) {
			throw error(response.status, `Failed to fetch icon from ${provider}`);
		}
		const contentType = response.headers.get('content-type') || 'image/svg+xml';
		const iconData = await response.arrayBuffer();
		const cachedResponse = new Response(iconData, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400',
				// Client-side cache for 24 hours
				'Access-Control-Allow-Origin': '*',
				// Allow CORS for icons
				'X-Content-Type-Options': 'nosniff'
			}
		});
		iconCache.set(cacheKey, {
			data: cachedResponse.clone(),
			timestamp: Date.now()
		});
		return cachedResponse;
	} catch (err) {
		console.error(`[Icon Proxy] Failed to fetch ${externalUrl}:`, err);
		throw error(502, 'Failed to fetch icon from external provider');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
