/**
 * @file src/utils/apiClient.ts
 * @description Modern API client for RESTful collection endpoints with enhanced performance and caching
 *
 * Features:
 *
 */

import axios from 'axios';

// System Logger
import { logger } from '@utils/logger.svelte';

// Modern JSON-based API client configuration
export const config = {
	headers: { 'Content-Type': 'application/json' },
	withCredentials: true
};

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Modern RESTful API request function
 * Uses proper HTTP methods and endpoints instead of method-in-body pattern
 */
export async function apiRequest(
	method: ApiMethod,
	collectionId: string,
	payload: Record<string, unknown> = {},
	entryId?: string,
	retries = 3
): Promise<unknown> {
	// Build RESTful endpoint URL
	let endpoint = `/api/collections/${collectionId}`;
	if (entryId) {
		endpoint += `/${entryId}`;
	}

	// Log request details in development
	if (import.meta.env.DEV) {
		logger.debug(`API ${method} request to: ${endpoint}`, { payload });
	}

	try {
		let response;

		switch (method) {
			case 'GET': {
				// Convert payload to query parameters for GET requests
				const params = new URLSearchParams();
				Object.entries(payload).forEach(([key, value]) => {
					if (value !== undefined && value !== null) {
						params.append(key, String(value));
					}
				});
				const queryString = params.toString();
				const getUrl = queryString ? `${endpoint}?${queryString}` : endpoint;
				response = await axios.get(getUrl, { withCredentials: true });
				break;
			}

			case 'POST':
				response = await axios.post(endpoint, payload, config);
				break;

			case 'PATCH':
				response = await axios.patch(endpoint, payload, config);
				break;

			case 'DELETE':
				response = await axios.delete(endpoint, { withCredentials: true });
				break;

			default:
				throw new Error(`Unsupported HTTP method: ${method}`);
		}

		logger.info(`Successfully completed ${method} request to ${endpoint}`);
		return response.data;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			// Retry for 5xx errors
			if (error.response?.status && error.response.status >= 500 && retries > 0) {
				logger.warn(`Retrying ${method} request (${retries} attempts remaining) for status ${error.response.status}`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
				return apiRequest(method, collectionId, payload, entryId, retries - 1);
			}

			// Handle 4xx errors
			if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
				const apiMessage = error.response.data?.error || error.message;
				logger.error(`Client-side error in ${method} request (status ${error.response.status}):`, apiMessage);
				throw new Error(apiMessage);
			}
		}

		const errorMessage = `Failed to complete ${method} request: ${error instanceof Error ? error.message : String(error)}`;
		logger.error(errorMessage, error);
		throw new Error(errorMessage);
	}
}

/**
 * Specialized function for status updates
 */
export async function updateStatus(collectionId: string, entryId: string, status: string, entryIds?: string[]): Promise<unknown> {
	const endpoint = `/api/collections/${collectionId}/${entryId}/status`;
	const payload = { status, ...(entryIds && { entries: entryIds }) };

	try {
		const response = await axios.patch(endpoint, payload, config);
		logger.info(`Status updated for entry ${entryId} to ${status}`);
		return response.data;
	} catch (error) {
		logger.error(`Failed to update status: ${error}`);
		throw error;
	}
}

/**
 * Specialized function for revisions
 */
export async function getRevisions(
	collectionId: string,
	entryId: string,
	options: {
		page?: number;
		limit?: number;
		revisionId?: string;
		compareWith?: string;
		metaOnly?: boolean;
	} = {}
): Promise<unknown> {
	const endpoint = `/api/collections/${collectionId}/${entryId}/revisions`;
	const params = new URLSearchParams();

	Object.entries(options).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			params.append(key, String(value));
		}
	});

	const queryString = params.toString();
	const url = queryString ? `${endpoint}?${queryString}` : endpoint;

	try {
		const response = await axios.get(url, { withCredentials: true });
		logger.info(`Revisions retrieved for entry ${entryId}`);
		return response.data;
	} catch (error) {
		logger.error(`Failed to get revisions: ${error}`);
		throw error;
	}
}

// --- Enhanced Caching Logic ---
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache TTL

interface CacheEntry {
	data: GetDataResponse;
	timestamp: number;
	ttl: number;
}
const dataCache = new Map<string, CacheEntry>();

function generateCacheKey(query: Record<string, unknown>): string {
	const normalizedQuery = {
		collectionId: (query.collectionId as string)?.trim().toLowerCase(),
		page: query.page || 1,
		pageSize: query.pageSize || query.limit || 25, // Updated to use pageSize
		contentLanguage: query.contentLanguage || 'en',
		filter: query.filter || '{}',
		sortField: query.sortField || 'createdAt',
		sortDirection: query.sortDirection || 'desc',
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

/**
 * Enhanced getData function using new RESTful endpoints
 */
export async function getData(query: {
	collectionId: string;
	page?: number;
	pageSize?: number;
	limit?: number; // Backward compatibility
	contentLanguage?: string;
	filter?: string;
	sortField?: string;
	sortDirection?: 'asc' | 'desc';
	sort?: string; // Backward compatibility
	_langChange?: number;
}): Promise<GetDataResponse> {
	const cacheKey = generateCacheKey(query);
	const cachedEntry = dataCache.get(cacheKey);

	if (cachedEntry && isCacheValid(cachedEntry)) {
		logger.debug(`[CLIENT] Cache hit for ${query.collectionId}`);
		return cachedEntry.data;
	}

	try {
		// Convert legacy sort format if needed
		if (query.sort && !query.sortField) {
			try {
				const sortObj = JSON.parse(query.sort);
				const [field, direction] = Object.entries(sortObj)[0] || ['createdAt', 'desc'];
				query.sortField = field as string;
				query.sortDirection = direction === 1 || direction === 'asc' ? 'asc' : 'desc';
			} catch {
				// If sort parsing fails, use defaults
				query.sortField = 'createdAt';
				query.sortDirection = 'desc';
			}
		}

		// Prepare query parameters for RESTful endpoint
		const apiQuery = {
			page: query.page || 1,
			pageSize: query.pageSize || query.limit || 25,
			contentLanguage: query.contentLanguage || 'en',
			filter: query.filter || '{}',
			sortField: query.sortField || 'createdAt',
			sortDirection: query.sortDirection || 'desc'
		};

		const response = await apiRequest('GET', query.collectionId, apiQuery);

		// Handle new response format
		const apiResponse = response as { success: boolean; data: { items: unknown[]; total: number; totalPages: number } };

		if (!apiResponse.success || !Array.isArray(apiResponse.data.items)) {
			logger.warn(`getData received invalid data for ${query.collectionId}. Returning empty.`);
			const emptyResult = { entryList: [], pagesCount: 1, totalItems: 0 };
			dataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), ttl: CACHE_TTL_MS / 2 });
			return emptyResult;
		}

		const result: GetDataResponse = {
			entryList: apiResponse.data.items as Record<string, unknown>[],
			pagesCount: apiResponse.data.totalPages || 1,
			totalItems: apiResponse.data.total || apiResponse.data.items.length
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
			const emptyResult = { entryList: [], pagesCount: 1, totalItems: 0 };
			dataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), ttl: CACHE_TTL_MS / 2 });
			return emptyResult;
		}
		throw error;
	}
}

/**
 * Get all collections list
 */
export async function getCollections(
	options: {
		includeFields?: boolean;
		includeStats?: boolean;
	} = {}
): Promise<unknown> {
	const params = new URLSearchParams();
	if (options.includeFields) params.append('includeFields', 'true');
	if (options.includeStats) params.append('includeStats', 'true');

	const queryString = params.toString();
	const url = queryString ? `/api/collections?${queryString}` : '/api/collections';

	try {
		const response = await axios.get(url, { withCredentials: true });
		return response.data;
	} catch (error) {
		logger.error('Failed to get collections:', error);
		throw error;
	}
}
