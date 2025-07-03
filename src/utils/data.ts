/**
 * @file src/utils/data.ts
 * @description Utility functions for handling API requests and data operations.
 *
 * This module provides a set of functions to interact with the API:
 * - handleRequest: Generic function to handle API requests
 * - getData: Retrieve data from a specified collection
 * - addData: Add new data to a collection
 * - updateData: Update existing data in a collection
 * - deleteData: Remove data from a collection
 * - setStatus: Set the status of data in a collection
 *
 * Features:
 * - Centralized error handling and logging
 * - Type-safe collection names using ContentTypes
 * - Consistent API request formatting
 * - Support for pagination, filtering, and sorting in getData
 * - Enhanced 403/404 error handling in getData to prevent toasts for "no data" scenarios.
 *
 * Usage:
 * Import and use these functions to perform CRUD operations on collections
 * via the API endpoint.
 */

import axios from 'axios';
import { error } from '@sveltejs/kit';
import { obj2formData, col2formData, config, toFormData } from './utils';
import type { ContentTypes, Schema } from '@src/types';

// Store
import { collection, collectionValue, mode } from '../stores/collectionStore.svelte';

// System Logs
import { logger } from '@utils/logger.svelte';

// Simple in-memory cache for getData requests
interface CacheEntry {
	data: { entryList: Record<string, unknown>[]; pagesCount: number };
	timestamp: number;
	ttl: number;
}

const dataCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds cache TTL

// Helper function to generate cache key
function generateCacheKey(query: {
	collectionId: string;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sort?: string;
}): string {
	const normalizedQuery = {
		collectionId: query.collectionId.trim().toLowerCase(),
		page: query.page || 1,
		limit: query.limit || 10,
		contentLanguage: query.contentLanguage || 'en',
		filter: query.filter || '{}',
		sort: query.sort || '{}'
	};
	return JSON.stringify(normalizedQuery);
}

// Helper function to check cache validity
function isCacheValid(cacheEntry: CacheEntry): boolean {
	return Date.now() - cacheEntry.timestamp < cacheEntry.ttl;
}

// Helper function to clear expired cache entries
function clearExpiredCache(): void {
	const now = Date.now();
	for (const [key, entry] of dataCache.entries()) {
		if (now - entry.timestamp >= entry.ttl) {
			dataCache.delete(key);
		}
	}
}

// Function to invalidate cache for a collection (useful after updates/deletes)
export function invalidateCollectionCache(collectionId: string): void {
	const normalizedCollectionId = collectionId.trim().toLowerCase();
	for (const [key] of dataCache.entries()) {
		if (key.includes(`"collectionId":"${normalizedCollectionId}"`)) {
			dataCache.delete(key);
		}
	}
}

// Helper function to handle API requests
export async function handleRequest(data: FormData, method: string, retries = 3): Promise<unknown> {
	data.append('method', method);

	// Log the FormData entries before sending
	for (const [key, value] of data.entries()) {
		logger.debug(`FormData key: \x1b[34m${key}\x1b[0m, value: \x1b[34m${value}\x1b[0m`);
	}

	try {
		const response = await axios.post('/api/query', data, {
			...config,
			withCredentials: true // Ensure cookies are sent with the request
		});
		logger.info(`Successfully completed \x1b[34m${method}\x1b[0m request`, { data: response.data });
		return response.data;
	} catch (error) {
		if (axios.isAxiosError(error) && error.response?.status === 500 && retries > 0) {
			logger.warn(`Retrying \x1b[34m${method}\x1b[0m request (\x1b[34m${retries}\x1b[0m attempts remaining)`);
			await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
			return handleRequest(data, method, retries - 1);
		}

		logger.error(`Error in \x1b[34m${method}\x1b[0m request:`, error);
		throw new Error(`Failed to complete \x1b[34m${method}\x1b[0m request: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Function to get data from a specified collection
export async function getData(
	query: {
		collectionId: string;
		page?: number;
		limit?: number;
		contentLanguage?: string;
		filter?: string;
		sort?: string;
	},
	retries = 3
): Promise<{ entryList: Record<string, unknown>[]; pagesCount: number }> {
	// Add logging to track when getData is called
	console.log(`[CLIENT] getData called for collection: ${query.collectionId}, page: ${query.page}, limit: ${query.limit}`);

	// Generate cache key and check for cached data
	const cacheKey = generateCacheKey(query);
	const cachedEntry = dataCache.get(cacheKey);

	if (cachedEntry && isCacheValid(cachedEntry)) {
		console.log(`[CLIENT] Cache hit for ${query.collectionId}`);
		return cachedEntry.data;
	}

	console.log(`[CLIENT] Cache miss for ${query.collectionId}, fetching from API`);
	console.trace('[CLIENT] getData call stack');

	// Clear expired cache entries periodically
	clearExpiredCache();

	// Ensure collectionId is properly formatted
	const collectionId = query.collectionId.trim().toLowerCase();

	// Create query with fallback language handling
	const q = toFormData({
		method: 'GET',
		...query,
		collectionId,
		contentLanguage: query.contentLanguage || 'en' // Default to English if not specified
	});

	try {
		const response = await axios.post('/api/query', q);

		// Handle specific status codes that should NOT trigger a toast in the UI
		if (axios.isAxiosError(response) && (response.response?.status === 403 || response.response?.status === 404)) {
			logger.info(`getData returned status ${response.response.status} for collection ${collectionId}. Treating as no data.`);
			const emptyResult = {
				entryList: [],
				pagesCount: 1 // Assuming 1 page if there's no data, or 0 if your pagination handles that
			};

			// Cache the empty result for a shorter time
			dataCache.set(cacheKey, {
				data: emptyResult,
				timestamp: Date.now(),
				ttl: CACHE_TTL / 2 // Cache empty results for half the normal TTL
			});

			return emptyResult;
		}

		// Handle empty or invalid responses, now *after* checking for special status codes
		if (!response.data || !Array.isArray(response.data.entryList)) {
			// If response is empty or invalid, return an empty list
			logger.warn(`getData received invalid data format for collection ${collectionId}. Returning empty list.`);
			return {
				entryList: [],
				pagesCount: 1 // Default to 1 page for an empty result
			};
		}

		// Process dates from MongoDB
		const processedEntries = response.data.entryList.map((entry: Record<string, unknown>) => ({
			...entry,
			createdAt: entry.createdAt ? new Date(entry.createdAt as string) : null,
			updatedAt: entry.updatedAt ? new Date(entry.updatedAt as string) : null
		}));

		const result = {
			entryList: processedEntries,
			pagesCount: response.data.pagesCount || 1
		};

		// Cache the successful result
		dataCache.set(cacheKey, {
			data: result,
			timestamp: Date.now(),
			ttl: CACHE_TTL
		});

		console.log(`[CLIENT] Cached result for ${query.collectionId}`);
		return result;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			// Specifically handle 403/404 that should NOT trigger a toast
			if (error.response?.status === 403 || error.response?.status === 404) {
				logger.info(`getData caught AxiosError status ${error.response.status} for collection ${collectionId}. Treating as no data.`);
				return {
					entryList: [],
					pagesCount: 1
				};
			}

			// Retry for 500 errors
			if (error.response?.status === 500 && retries > 0) {
				logger.warn(`Retrying getData (${retries} attempts remaining) for 500 error`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
				return getData(query, retries - 1);
			}
		}

		logger.error('Error in getData:', error);
		// For any other error (network errors, other HTTP status codes), re-throw to trigger toast in EntryList
		throw new Error(`Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Function to add data to a specified collection
export async function addData({ data, collectionId: contentTypes }: { data: FormData; collectionId: keyof ContentTypes }) {
	data.append('collectionId', contentTypes as string);
	data.append('method', 'POST');
	const result = await axios.post(`/api/query`, data, config).then((res) => res.data);

	// Invalidate cache for this collection
	invalidateCollectionCache(contentTypes as string);

	return result;
}

// Function to update data in a specified collection
export async function updateData({ data, collectionId: contentTypes }: { data: FormData; collectionId: keyof ContentTypes }) {
	data.append('collectionId', contentTypes as string);
	data.append('method', 'PATCH');
	const result = await axios.post(`/api/query`, data, config).then((res) => res.data);

	// Invalidate cache for this collection
	invalidateCollectionCache(contentTypes as string);

	return result;
}

// Move FormData to trash folder and delete trash files older than 30 days
export async function deleteData({ data, collectionId: contentTypes }: { data: FormData; collectionId: ContentTypes }) {
	data.append('collectionId', contentTypes);
	data.append('method', 'DELETE');

	try {
		logger.debug(`Deleting data for collection: ${contentTypes}`);
		const response = await axios.post(`/api/query`, data, config);
		logger.debug(`Data deleted successfully for collection: ${contentTypes}`);

		// Invalidate cache for this collection
		invalidateCollectionCache(contentTypes);

		return response.data;
	} catch (err) {
		const message = `Error deleting data for collection ${contentTypes}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (axios.isAxiosError(err)) {
			logger.error('Axios error details:', {
				response: err.response?.data,
				status: err.response?.status,
				headers: err.response?.headers
			});
		}
		throw new Error(message);
	}
}

// Function to set the status of data in a specified collection
export async function setStatus({ data, collectionId }: { data: FormData; collectionId: keyof ContentTypes }) {
	data.append('collectionId', collectionId as string);
	data.append('method', 'SETSTATUS');
	const result = await axios.post(`/api/query`, data, config).then((res) => res.data);

	// Invalidate cache for this collection
	invalidateCollectionCache(collectionId as string);

	return result;
}

// Save Collections data to the database
export async function saveFormData({
	data,
	_collection,
	_mode,
	id,
	user
}: {
	data: FormData | { [Key: string]: unknown } | { [Key: string]: () => unknown }; // Expanded type for data
	_collection?: Schema;
	_mode?: 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';
	id?: string;
	user?: { username?: string };
}) {
	const $mode = _mode || mode;
	const $collection = _collection || collection();

	let formData: FormData;

	// Convert data to FormData based on its type
	if (data instanceof FormData) {
		formData = data;
	} else if (Object.values(data).some((v) => typeof v === 'function')) {
		// This handles the { [Key: string]: () => unknown } case
		logger.debug('Converting collection functions to FormData...');
		formData = await col2formData(data as { [Key: string]: () => unknown });
	} else {
		// This handles the plain object case from RightSidebar
		logger.debug('Converting plain object to FormData...');
		formData = obj2formData(data as { [Key: string]: unknown });
	}

	// Add the user who last saved (if available)
	if (user && user.username) {
		formData.append('lastSavedBy', user.username);
	}

	if ($mode === 'edit' && !id) {
		const message = 'ID is required for edit mode.';
		logger.error(message);
		throw error(400, message);
	}

	// TODO: Add meta_data to formData
	// if (!meta_data.is_empty()) formData.append('_meta_data', JSON.stringify(meta_data.get()));

	// Safely append status with a default value
	if (!formData.has('status')) {
		formData.append('status', (collectionValue.value?.status || 'unpublished').toString());
	}

	try {
		switch ($mode) {
			case 'create':
				logger.debug('Saving data in create mode.');
				return await addData({
					data: formData,
					collectionId: $collection._id as keyof ContentTypes
				});

			case 'edit':
				logger.debug('Saving data in edit mode.');
				// Safely append _id with fallback
				formData.append('updatedAt', Math.floor(Date.now() / 1000).toString());
				//ignoring revision for now

				//if ($collection.revision) {
				//  logger.debug('Creating new revision.');
				//  const newRevision = {
				//    ...collectionValue.value,
				//    _id: uuidv4().replace(/-/g, ''),
				//    __v: [
				//      ...(collectionValue.value?.__v || []),
				//      {
				//        revisionNumber: collectionValue.value?.__v ? collectionValue.value.__v.length : 0,
				//        editedAt: Math.floor(Date.now() / 1000).toString(),
				//        editedBy: { username },
				//        changes: {}
				//      }
				//    ]
				//  };
				//
				//  const revisionFormData = new FormData() as FormData;
				//  revisionFormData.append('data', JSON.stringify(newRevision));
				//  revisionFormData.append('collectionId', $collection._id);
				//
				//  await handleRequest(revisionFormData, 'POST');
				//}

				return await updateData({ data: formData, collectionId: $collection._id });

			default: {
				const message = `Unhandled mode: ${$mode}`;
				logger.error(message);
				throw error(400, message);
			}
		}
	} catch (err) {
		const message = `Failed to save data in mode ${$mode}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(400, message);
	}
}
