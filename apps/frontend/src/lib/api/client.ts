/**
 * REST API Client for SveltyCMS
 */

import { API_URL, API_TOKEN } from '../config';

export interface FetchOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
}

/**
 * Fetch data from SveltyCMS REST API
 */
export async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
		...(options.headers || {})
	};

	const response = await fetch(`${API_URL}${endpoint}`, {
		method: options.method || 'GET',
		headers,
		...(options.body ? { body: JSON.stringify(options.body) } : {})
	});

	if (!response.ok) {
		throw new Error(`API Error: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

/**
 * Fetch a collection of entries
 */
export async function getCollection(collectionId: string, params?: Record<string, string>) {
	const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
	return fetchAPI(`/collections/${collectionId}${queryString}`);
}

/**
 * Fetch a single entry by ID
 */
export async function getEntry(collectionId: string, entryId: string) {
	return fetchAPI(`/collections/${collectionId}/${entryId}`);
}

/**
 * Fetch a single entry by slug
 */
export async function getEntryBySlug(collectionId: string, slug: string) {
	return fetchAPI(`/collections/${collectionId}/slug/${slug}`);
}
