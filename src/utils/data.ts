/**
 * @file src/utils/data.ts
 * @description Client-side API Service Layer.
 *
 * This module acts as a dedicated client for interacting with the backend's
 * `/api/query` endpoint. It abstracts away the complexities of building FormData,
 * handling requests, and managing client-side caching. Components should import
 * and use these functions to perform data operations, ensuring a consistent,
 * maintainable, and centralized approach to API communication.
 *
 * Features:
 * - Centralized API request logic using a `handleRequest` helper.
 * - Functions for all primary CRUD and status operations.
 * - Client-side caching with TTL for GET requests to improve performance.
 * - Cache invalidation after write operations (add, update, delete, setStatus).
 * - Type-safe collection names using ContentTypes.
 */

import type { ContentTypes } from '@src/types';
import axios from 'axios';

// System Logs
import { logger } from '@utils/logger.svelte';

// --- Internal Helper ---

/**
 * Converts a plain JavaScript object into a FormData object.
 * This is now an internal helper function for the data service.
 * @param obj The object to convert.
 * @returns A FormData instance.
 */
function toFormData(obj: Record<string, unknown>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) {
			continue; // Skip null or undefined values
		}
		if (typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
			formData.append(key, JSON.stringify(value));
		} else {
			// This handles strings, numbers, booleans, Files, and Blobs
			formData.append(key, value as string | Blob); // FormData can handle string or Blob types
		}
	}
	return formData;
}

// --- Cache Implementation ---
interface CacheEntry {
	data: { entryList: Record<string, unknown>[]; pagesCount: number };
	timestamp: number;
	ttl: number;
}
const dataCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds cache TTL

function generateCacheKey(query: Record<string, unknown>): string {
	const normalizedQuery = { ...query };
	// Normalize common query params for consistent caching
	normalizedQuery.page = query.page || 1;
	normalizedQuery.limit = query.limit || 10;
	return JSON.stringify(normalizedQuery);
}

function isCacheValid(cacheEntry: CacheEntry): boolean {
	return Date.now() - cacheEntry.timestamp < cacheEntry.ttl;
}

export function invalidateCollectionCache(collectionId: string): void {
	const normalizedId = collectionId.trim().toLowerCase();
	for (const key of dataCache.keys()) {
		if (key.includes(`"collectionId":"${normalizedId}"`)) {
			dataCache.delete(key);
		}
	}
}

// --- Core Request Handler ---

// A centralized function to handle all POST requests to the `/api/query` endpoint
async function handleRequest(data: Record<string, unknown>, retries = 3): Promise<unknown> {
	const formData = toFormData(data);

	try {
		const response = await axios.post('/api/query', formData, {
			withCredentials: true // Ensure cookies are sent
		});
		logger.info(`Successfully completed '${data.method}' request for collection '${data.collectionId}'`, {
			data: response.data
		});
		return response.data;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			if (error.response?.status === 500 && retries > 0) {
				logger.warn(`Retrying '${data.method}' request (${retries} attempts remaining)`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
				return handleRequest(data, retries - 1);
			}
			logger.error(`Error in '${data.method}' request:`, error.response?.data || error.message);
			throw new Error(error.response?.data?.error || `Failed to complete request: ${error.message}`);
		}
		logger.error(`Unknown error in '${data.method}' request:`, error);
		throw new Error(`An unknown error occurred: ${String(error)}`);
	}
}

// --- Public API Functions ---

// Retrieves data from a specified collection
export async function getData(query: {
	collectionId: string;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: Record<string, unknown>;
	sort?: Record<string, unknown>;
}): Promise<{ entryList: Record<string, unknown>[]; pagesCount: number }> {
	const cacheKey = generateCacheKey(query);
	const cachedEntry = dataCache.get(cacheKey);

	if (cachedEntry && isCacheValid(cachedEntry)) {
		return cachedEntry.data;
	}

	try {
		const response = (await handleRequest({ method: 'GET', ...query })) as {
			entryList: Record<string, unknown>[];
			pagesCount: number;
		};
		const result = {
			entryList: response.entryList || [],
			pagesCount: response.pagesCount || 1
		};
		dataCache.set(cacheKey, { data: result, timestamp: Date.now(), ttl: CACHE_TTL });
		return result;
	} catch (error) {
		logger.error('getData failed:', error);
		// For GET, it's often better to return empty data than to crash the UI
		return { entryList: [], pagesCount: 1 };
	}
}

// Adds a new entry to a collection
export async function addData(collectionId: keyof ContentTypes, entryData: Record<string, unknown>) {
	invalidateCollectionCache(collectionId as string);
	return handleRequest({
		method: 'POST',
		collectionId: collectionId,
		data: JSON.stringify(entryData) // Backend expects data as a stringified JSON
	});
}

// Updates an existing entry in a collection
export async function updateData(collectionId: keyof ContentTypes, entryData: Record<string, unknown>) {
	invalidateCollectionCache(collectionId as string);
	return handleRequest({
		method: 'PATCH',
		collectionId: collectionId,
		id: entryData._id, // The ID is crucial for PATCH
		data: JSON.stringify(entryData)
	});
}

//Performs a hard delete on one or more entries in a collection
export async function deleteData(collectionId: keyof ContentTypes, ids: string[]) {
	invalidateCollectionCache(collectionId as string);
	return handleRequest({
		method: 'DELETE',
		collectionId: collectionId,
		ids: JSON.stringify(ids)
	});
}

// Sets the status of one or more entries in a collection (for soft-deletes, publishing, etc.)
export async function setStatus(
	collectionId: keyof ContentTypes,
	ids: string[],
	status: 'published' | 'unpublished' | 'deleted' | 'scheduled',
	scheduleTime?: number
) {
	invalidateCollectionCache(collectionId as string);
	const body: Record<string, unknown> = {
		method: 'SETSTATUS',
		collectionId: collectionId,
		ids: JSON.stringify(ids),
		status: status
	};
	if (status === 'scheduled' && scheduleTime) {
		body._scheduled = scheduleTime;
	}
	return handleRequest(body);
}
