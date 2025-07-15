/**
 * @file src/utils/apiClient.ts
 * @description Utility functions for handling API requests and data operations.
 */

import axios from 'axios';
import { obj2formData } from './utils';

// System Logger
import { logger } from '@utils/logger.svelte';

export const config = {
	headers: { 'Content-Type': 'multipart/form-data' },
	withCredentials: true
};

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'SETSTATUS' | 'SCHEDULE';

// A utility function to make API requests to the SveltyCMS backend
export async function apiRequest(
	method: ApiMethod,
	collectionId: string,
	payload: Record<string, unknown>,
	retries = 3 // Added retry mechanism
): Promise<unknown> {
	// Deep clone payload to avoid modifying the original object during retries
	const dataForForm = { ...payload, method, collectionId };
	const formData = obj2formData(dataForForm);

	// Log formData entries only in development
	if (import.meta.env.DEV) {
		logger.debug(`Sending API request with method: ${method} for collection: ${collectionId}`);
		for (const [key, value] of formData.entries()) {
			logger.debug(`FormData key: \x1b[34m${key}\x1b[0m, value: \x1b[34m${value}\x1b[0m`);
		}
	}

	try {
		const response = await axios.post('/api/query', formData, config);
		logger.info(`Successfully completed ${method} request for ${collectionId}`);
		return response.data;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			// Retry for 5xx errors
			if (error.response?.status && error.response.status >= 500 && retries > 0) {
				logger.warn(`Retrying \x1b[34m${method}\x1b[0m request (\x1b[34m${retries}\x1b[0m attempts remaining) for status ${error.response.status}`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
				return apiRequest(method, collectionId, payload, retries - 1); // Pass original payload
			}
			// Re-throw 4xx errors immediately (they are often client-side issues)
			if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
				const apiMessage = error.response.data?.message || error.message;
				logger.error(`Client-side error in \x1b[34m${method}\x1b[0m request (status ${error.response.status}):`, apiMessage);
				throw new Error(apiMessage); // Throw API's message if available
			}
		}

		const errorMessage = `Failed to complete ${method} request: ${error instanceof Error ? error.message : String(error)}`;
		logger.error(errorMessage, error);
		throw new Error(errorMessage);
	}
}

// --- Caching Logic ---
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache TTL in milliseconds

interface CacheEntry {
	data: GetDataResponse;
	timestamp: number;
	ttl: number;
}
const dataCache = new Map<string, CacheEntry>();

function generateCacheKey(query: Record<string, unknown>): string {
	// More specific type for query
	const normalizedQuery = {
		collectionId: (query.collectionId as string)?.trim().toLowerCase(),
		page: query.page || 1,
		limit: query.limit || 10,
		contentLanguage: query.contentLanguage || 'en',
		filter: query.filter || '{}',
		sort: query.sort || '{}',
		_langChange: query._langChange || 0
	};
	return JSON.stringify(normalizedQuery);
}

function isCacheValid(cacheEntry: CacheEntry): boolean {
	return Date.now() - cacheEntry.timestamp < cacheEntry.ttl;
}

export function invalidateCollectionCache(collectionId: string): void {
	const normalizedCollectionId = collectionId.trim().toLowerCase();
	for (const [key] of dataCache.entries()) {
		if (key.includes(`"collectionId":"${normalizedCollectionId}"`)) {
			dataCache.delete(key);
		}
	}
}

interface GetDataResponse {
	entryList: Record<string, unknown>[];
	pagesCount: number;
	totalItems: number;
}

export async function getData(query: {
	collectionId: string;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sort?: string;
	_langChange?: number;
}): Promise<GetDataResponse> {
	const cacheKey = generateCacheKey(query);
	const cachedEntry = dataCache.get(cacheKey);

	if (cachedEntry && isCacheValid(cachedEntry)) {
		logger.debug(`[CLIENT] Cache hit for ${query.collectionId}`);
		return cachedEntry.data;
	}

	try {
		// Pass `query` directly as payload to `apiRequest`
		const response = await apiRequest('GET', query.collectionId, query);

		const apiResponse = response as GetDataResponse; // Type assert the response

		// Handle empty or invalid responses
		if (!apiResponse || !Array.isArray(apiResponse.entryList)) {
			logger.warn(`getData received invalid data for ${query.collectionId}. Returning empty.`);
			const emptyResult = { entryList: [], pagesCount: 1, totalItems: 0 };
			dataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), ttl: CACHE_TTL_MS / 2 }); // Cache empty result for shorter time
			return emptyResult;
		}

		const result: GetDataResponse = {
			entryList: apiResponse.entryList,
			pagesCount: apiResponse.pagesCount || 1,
			totalItems: apiResponse.totalItems || apiResponse.entryList.length // Fallback totalItems
		};

		dataCache.set(cacheKey, {
			data: result,
			timestamp: Date.now(),
			ttl: CACHE_TTL_MS
		});

		return result;
	} catch (error) {
		logger.error('Error in getData:', error);
		if (axios.isAxiosError(error) && (error.response?.status === 403 || error.response?.status === 404)) {
			// Do not re-throw these specific errors, return empty data
			const emptyResult = { entryList: [], pagesCount: 1, totalItems: 0 };
			dataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), ttl: CACHE_TTL_MS / 2 });
			return emptyResult;
		}
		// For all other errors, re-throw to be handled by the calling component (e.g., toast)
		throw error;
	}
}
