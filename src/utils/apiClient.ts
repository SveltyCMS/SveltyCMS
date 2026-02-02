/**
 * @file src/utils/apiClient.ts
 * @description Modern API client for RESTful collection endpoints.
 * Includes unified error handling compatible with server-side apiHandler.
 */

import type { ISODateString } from '@src/content/types';
import { logger } from '@utils/logger';
import { publicEnv } from '@stores/globalSettings.svelte.ts';

// --- Type Definitions ---

/**
 * Standardized API Response structure.
 * Matches the shape returned by the server-side 'handleApiError'.
 */
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	// Error fields
	message?: string; // Primary error message
	error?: string; // Alias for message (for backward compatibility)
	code?: string; // Error code (e.g., 'VALIDATION_ERROR', 'FORBIDDEN')
	issues?: string[]; // Validation specific issues
}

export interface RevisionDiff {
	diff: Record<string, { status: 'modified' | 'added' | 'deleted'; old?: unknown; new?: unknown; value?: unknown }>;
	revisionData: Record<string, unknown>;
}

export interface RevisionMeta {
	_id: string;
	revision_at: ISODateString;
	revision_by: string;
}

export interface Collection {
	_id: string;
	name: string;
	fields: Record<string, unknown>[];
}

interface GetDataResponse {
	items: Record<string, unknown>[];
	total: number;
	totalPages: number;
	page?: number;
	pageSize?: number;
}

// --- Core API Functions ---

/**
 * Universal fetch wrapper that handles:
 * 1. JSON parsing
 * 2. HTTP Error status codes
 * 3. Unified Error Response extraction
 * 4. Network error catching
 */
async function fetchApi<T>(endpoint: string, options: RequestInit): Promise<ApiResponse<T>> {
	try {
		const response = await fetch(endpoint, {
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include', // Ensure cookies/auth are sent
			...options
		});

		// 1. Handle Successful Responses (2xx)
		if (response.ok) {
			// Handle 204 No Content
			if (response.status === 204) {
				return { success: true } as ApiResponse<T>;
			}

			// Attempt to parse JSON
			try {
				const data = await response.json();
				// Some endpoints might return { success: true, ... } or just data
				// We ensure the shape is consistent
				return { success: true, ...data };
			} catch (e) {
				// Fallback if response is OK but not JSON (rare)
				logger.warn(`[API] Response OK but invalid JSON at ${endpoint}`);
				return { success: true } as ApiResponse<T>;
			}
		}

		// 2. Handle HTTP Error Responses (4xx, 5xx)
		let errorData: Partial<ApiResponse> = {};
		try {
			errorData = await response.json();
		} catch {
			// Fallback if JSON parsing fails (e.g., raw 500 HTML or network gateway error)
			errorData = { message: response.statusText || `HTTP Error ${response.status}` };
		}

		// Log significant errors
		if (response.status >= 500) {
			logger.error(`[API Server Error] ${response.status} on ${endpoint}`, errorData);
		} else {
			// 4xx errors are warnings (validation, auth, etc.)
			logger.warn(`[API Client Fail] ${response.status} on ${endpoint}`, errorData);
		}

		// Return standardized error shape
		return {
			success: false,
			message: errorData.message || 'An unknown error occurred',
			error: errorData.message || errorData.error || 'An unknown error occurred', // Backward compat
			code: errorData.code || `HTTP_${response.status}`,
			issues: errorData.issues
		};
	} catch (error) {
		// 3. Handle Network/Client Errors (Offline, DNS, etc)
		const err = error as Error;
		logger.error(`[API Network Error] ${endpoint}`, err);
		return {
			success: false,
			message: err.message || 'Network error occurred',
			error: err.message,
			code: 'NETWORK_ERROR'
		};
	}
}

// --- Entry Action Functions ---

export function createEntry(collectionId: string, payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}`, {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export function updateEntry(collectionId: string, entryId: string, payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/${entryId}`, {
		method: 'PATCH',
		body: JSON.stringify(payload)
	});
}

export function batchUpdateEntries(collectionId: string, payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
	const { ids, status, ...otherFields } = payload;
	if (status && ids && Array.isArray(ids)) {
		return fetchApi(`/api/collections/${collectionId}/${ids[0]}/status`, {
			method: 'PATCH',
			body: JSON.stringify({ status, entries: ids, ...otherFields })
		});
	}
	// Return unified error object instead of throwing, to prevent unhandled promise rejections
	return Promise.resolve({
		success: false,
		message: 'Batch updates only supported for status changes',
		code: 'NOT_IMPLEMENTED'
	});
}

export function updateEntryStatus(collectionId: string, entryId: string, status: string): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/${entryId}/status`, {
		method: 'PATCH',
		body: JSON.stringify({ status })
	});
}

export function deleteEntry(collectionId: string, entryId: string): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/${entryId}`, {
		method: 'DELETE'
	});
}

export function batchDeleteEntries(collectionId: string, entryIds: string[]): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch`, {
		method: 'POST',
		body: JSON.stringify({ action: 'delete', entryIds })
	});
}

export function createClones(collectionId: string, entries: Record<string, unknown>[]): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch-clone`, {
		method: 'POST',
		body: JSON.stringify({ entries })
	});
}

export function batchCloneEntries(collectionId: string, entryIds: string[]): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch`, {
		method: 'POST',
		body: JSON.stringify({ action: 'clone', entryIds })
	});
}

export function batchUpdateEntriesStatus(collectionId: string, entryIds: string[], status: string): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch`, {
		method: 'POST',
		body: JSON.stringify({ action: 'status', entryIds, status })
	});
}

// --- Revision Functions ---

export async function getRevisionDiff(params: {
	collectionId: string;
	entryId: string;
	revisionId: string;
	currentData: Record<string, unknown>;
}): Promise<ApiResponse<RevisionDiff>> {
	const { collectionId, entryId, revisionId, currentData } = params;
	const endpoint = `/api/collections/${collectionId}/${entryId}/revisions/diff`;

	return fetchApi(endpoint, {
		method: 'POST',
		body: JSON.stringify({ revisionId, currentData })
	});
}

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
): Promise<ApiResponse<RevisionMeta[]>> {
	const endpoint = `/api/collections/${collectionId}/${entryId}/revisions`;
	const searchParams = new URLSearchParams(options as Record<string, string>).toString();
	const url = `${endpoint}?${searchParams}`;

	return fetchApi(url, { method: 'GET' });
}

// --- Data & Cache Functions ---

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

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
		pageSize: query.pageSize || query.limit || 25,
		contentLanguage: query.contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE,
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
	logger.info(`[Cache] Invalidated for collection ${collectionId}`);
}

/**
 * Enhanced getData function using unified error handling and caching.
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
}): Promise<ApiResponse<GetDataResponse>> {
	const cacheKey = generateCacheKey(query);
	const cached = dataCache.get(cacheKey);

	if (cached && isCacheValid(cached)) {
		logger.info(`[Cache] HIT for ${cacheKey}`);
		return { success: true, data: cached.data };
	}
	logger.info(`[Cache] MISS for ${cacheKey}`);

	const { collectionId, ...params } = query;
	const searchParams = new URLSearchParams(params as Record<string, string>).toString();
	const endpoint = `/api/collections/${collectionId}?${searchParams}`;

	const result = await fetchApi<GetDataResponse>(endpoint, { method: 'GET' });

	// Cache successful responses
	if (result.success && result.data) {
		// Validation safety check
		if (!result.data.items || !Array.isArray(result.data.items)) {
			logger.error(`[getData] Invalid response format from ${endpoint}`, result.data);
			return {
				success: false,
				message: 'Invalid response format from server',
				code: 'INVALID_RESPONSE'
			};
		}

		dataCache.set(cacheKey, { data: result.data, timestamp: Date.now(), ttl: CACHE_TTL_MS });
		logger.info(`[getData] Cached successfully. Items: ${result.data.items.length}`);
	}

	return result;
}

export async function getCollections(
	options: {
		includeFields?: boolean;
		includeStats?: boolean;
	} = {}
): Promise<ApiResponse<Collection[]>> {
	const params = new URLSearchParams(options as Record<string, string>);
	const endpoint = `/api/collections?${params.toString()}`;
	return fetchApi(endpoint, { method: 'GET' });
}
