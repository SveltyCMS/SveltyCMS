/**
 * @file src/utils/apiClient.ts
 * @description Modern API client for RESTful collection endpoints with enhanced performance and caching
 * @example GET /api/collections/posts?limit=10&offset=0
 *
 * Features:
 *    * Performance optimization with QueryBuilder
 *    * Caching support for efficient data fetching
 *    * Error handling and logging
 *    * Custom log formatters
 *    * Conditional source file tracking
 *    * Error tracking service integration
 */

import { logger } from '@utils/logger.svelte';

// --- Type Definitions ---
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface RevisionDiff {
	diff: Record<string, { status: 'modified' | 'added' | 'deleted'; old?: unknown; new?: unknown; value?: unknown }>;
	revisionData: Record<string, unknown>;
}

export interface RevisionMeta {
	_id: string;
	revision_at: string; // ISO date string
	revision_by: string;
}

export interface Collection {
	_id: string;
	name: string;
	fields: Record<string, unknown>[];
	// Add other collection properties as needed
}

interface GetDataResponse {
	entryList: Record<string, unknown>[];
	pagesCount: number;
	totalItems: number;
}

// --- Core API Functions ---

async function fetchApi<T>(endpoint: string, options: RequestInit): Promise<ApiResponse<T>> {
	try {
		const response = await fetch(endpoint, {
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			...options
		});
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
			throw new Error(errorData.error || `An unknown error occurred.`);
		}
		return await response.json();
	} catch (error) {
		const err = error as Error;
		logger.error(`[API Client Error]`, err);
		return { success: false, error: err.message };
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
	return fetchApi(`/api/collections/${collectionId}/batch-update`, {
		method: 'PATCH',
		body: JSON.stringify(payload)
	});
}

export function batchDeleteEntries(collectionId: string, ids: string[], permanent: boolean): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch-delete`, {
		method: 'POST', // Use POST for DELETE with a body
		body: JSON.stringify({ ids, permanent })
	});
}

export function createClones(collectionId: string, entries: Record<string, unknown>[]): Promise<ApiResponse<unknown>> {
	return fetchApi(`/api/collections/${collectionId}/batch-clone`, {
		method: 'POST',
		body: JSON.stringify({ entries })
	});
}

// --- Revision Functions ---

// A wrapper for a POST request to compare a revision with current data
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

// Specialized function for revisions
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
		pageSize: query.pageSize || query.limit || 25,
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
	logger.info(`[Cache] Invalidated for collection ${collectionId}`);
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
	if (result.success && result.data) {
		dataCache.set(cacheKey, { data: result.data, timestamp: Date.now(), ttl: CACHE_TTL_MS });
	}
	return result;
}

// Get all collections list
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
