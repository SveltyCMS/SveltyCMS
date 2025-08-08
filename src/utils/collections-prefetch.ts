/**
 * @file src/utils/collections-prefetch.ts
 * @description Collection data caching utilities for performance optimization
 *
 * Gets first collection info and fetches/caches data during authentication for instant loading
 */

import { contentManager } from '@root/src/content/ContentManager';
import { logger } from '@utils/logger.svelte';
import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';

interface PrefetchedData {
	collectionId: string;
	data: { entryList: Record<string, unknown>[]; pagesCount: number; totalItems?: number };
	timestamp: number;
	language: string;
}

// In-memory cache for prefetched collection data
const prefetchCache = new Map<string, PrefetchedData>();
const PREFETCH_CACHE_TTL = 30 * 1000; // 30 seconds cache for prefetched data

// Get first collection info without fetching data when user switches to SignIn/SignUp to identify which collection is available
export async function getFirstCollectionInfo(language: string = 'en'): Promise<{ collectionId: string; name: string } | null> {
	try {
		// Get the first collection
		const firstCollection = contentManager.getFirstCollection();
		if (!firstCollection) {
			logger.debug('No first collection available');
			return null;
		}

		logger.info(
			`📋 Found first collection: \x1b[34m${firstCollection.name}\x1b[0m (\x1b[33m${firstCollection._id}\x1b[0m) for language: \x1b[34m${language}\x1b[0m`
		);
		return {
			collectionId: firstCollection._id,
			name: firstCollection.name
		};
	} catch (error) {
		logger.error(`❌ Failed to get first collection info: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

// Fetch and cache first page of entries for a collection during authentication with proper auth context to populate the cache
export async function fetchAndCacheCollectionData(language: string = 'en', fetch?: typeof globalThis.fetch, serverRequest?: Request): Promise<void> {
	try {
		// Get the first collection
		const firstCollection = contentManager.getFirstCollection();
		if (!firstCollection) {
			logger.debug('No first collection available for data fetching');
			return;
		}

		const collectionId = firstCollection._id;
		const cacheKey = `${collectionId}_${language}`;

		// Check if already cached and still valid
		const cached = prefetchCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < PREFETCH_CACHE_TTL) {
			logger.debug(`Collection data already cached for \x1b[34m${firstCollection.name}\x1b[0m`);
			return;
		}

		logger.debug(`🔄 Fetching data for collection: \x1b[34m${firstCollection.name}\x1b[0m (\x1b[33m${collectionId}\x1b[0m)`);

		const startTime = performance.now();

		// Use the same parameters as EntryList for consistency
		const params = new URLSearchParams({
			page: '1',
			pageSize: '10',
			contentLanguage: language,
			filter: JSON.stringify({ status: '!=deleted' }),
			sort: JSON.stringify({ createdAt: -1 })
		});

		// Determine the correct base URL
		let baseUrl: string;
		if (typeof window !== 'undefined') {
			// Client-side: use current origin
			baseUrl = window.location.origin;
		} else {
			// Server-side: use environment configuration or derive from request
			if (serverRequest) {
				const url = new URL(serverRequest.url);
				baseUrl = `${url.protocol}//${url.host}`;
			} else {
				baseUrl = dev ? publicEnv.HOST_DEV || 'http://localhost:5176' : publicEnv.HOST_PROD || 'https://localhost';
			}
		}

		const endpoint = `${baseUrl}/api/collections/${collectionId}`;
		const fetchFn = fetch || globalThis.fetch;

		// Prepare headers - forward cookies from server request if available
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (serverRequest) {
			// Forward cookies from the original request
			const cookieHeader = serverRequest.headers.get('cookie');
			if (cookieHeader) {
				headers['cookie'] = cookieHeader;
			}
		}

		const response = await fetchFn(`${endpoint}?${params.toString()}`, {
			method: 'GET',
			credentials: 'include',
			headers
		});

		if (!response.ok) {
			const errorText = await response.text();

			// Handle authentication errors gracefully - this is expected before login
			if (response.status === 401 || response.status === 403) {
				logger.debug(`🔒 Data fetching requires authentication (${response.status}) - will retry after login`);
				return; // Gracefully return without caching
			}

			logger.error(`❌ Data fetch HTTP ${response.status}: ${response.statusText} - ${errorText}`);
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		const fetchTime = performance.now() - startTime;

		// Cache the prefetched data
		prefetchCache.set(cacheKey, {
			collectionId,
			data: {
				entryList: data.entryList || [],
				pagesCount: data.pagesCount || 1,
				totalItems: data.totalItems
			},
			timestamp: Date.now(),
			language
		});

		const entryCount = data.entryList?.length || 0;
		logger.info(
			`✅ Cached \x1b[34m${entryCount}\x1b[0m entries for collection '\x1b[34m${firstCollection.name}\x1b[0m' in \x1b[32m${fetchTime.toFixed(2)}ms\x1b[0m`
		);
	} catch (error) {
		// Don't throw errors for data fetching - it's a performance optimization
		logger.error(`❌ Failed to fetch and cache collection data: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Get cached collection data if available called by EntryList to get immediate data from cache
export function getCachedCollectionData(
	collectionId: string,
	language: string = 'en'
): { entryList: Record<string, unknown>[]; pagesCount: number; totalItems?: number } | null {
	const cacheKey = `${collectionId}_${language}`;
	const cached = prefetchCache.get(cacheKey);

	if (!cached || Date.now() - cached.timestamp > PREFETCH_CACHE_TTL) {
		return null;
	}

	if (cached.collectionId !== collectionId) {
		return null;
	}

	logger.debug(`🚀 Using cached data for collection ${collectionId} (${cached.data.entryList.length} entries)`);
	return cached.data;
}

// Clear collection cache for a specific collection or all collections
export function clearCollectionCache(collectionId?: string, language?: string): void {
	if (collectionId && language) {
		const cacheKey = `${collectionId}_${language}`;
		prefetchCache.delete(cacheKey);
		logger.debug(`Cleared cache for ${collectionId}_${language}`);
	} else {
		prefetchCache.clear();
		logger.debug('Cleared all collection cache');
	}
}

// Get cache statistics for debugging
export function getCollectionCacheStats(): {
	size: number;
	entries: Array<{ key: string; age: number; entryCount: number }>;
} {
	const now = Date.now();
	const entries = Array.from(prefetchCache.entries()).map(([key, data]) => ({
		key,
		age: now - data.timestamp,
		entryCount: data.data.entryList.length
	}));

	return {
		size: prefetchCache.size,
		entries
	};
}
