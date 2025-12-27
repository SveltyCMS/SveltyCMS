/**
 * @file src/utils/media/api.ts
 * @description Media API client utilities
 */

import { logger } from '@utils/logger';

interface Watermark {
	id: string;
	name: string;
	url?: string;
}

/** Update media metadata */
export async function updateMediaMetadata(id: string, patch: Record<string, unknown>): Promise<unknown> {
	try {
		const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: patch })
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`HTTP ${res.status}: ${text}`);
		}

		return await res.json();
	} catch (err) {
		logger.error('updateMediaMetadata failed', { id, error: err });
		throw err;
	}
}

/** Fetch watermarks from collection (fallback URLs) */
export async function fetchWatermarks(collectionId = 'Watermarks'): Promise<Watermark[]> {
	const urls = [
		`/api/collections/${collectionId}?limit=100`,
		`/api/collections/${collectionId.toLowerCase()}?limit=100`,
		`/api/collections/${collectionId}/entries?limit=100`
	];

	for (const url of urls) {
		try {
			const res = await fetch(url);
			if (!res.ok) continue;

			const json = await res.json();
			const items = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : Array.isArray(json.items) ? json.items : [];

			return items.map((it: any) => ({
				id: it._id ?? it.id,
				name: it.name ?? it.title ?? `Watermark ${it._id ?? it.id}`,
				url: it.url ?? it.image?.url
			}));
		} catch (e) {
			// continue to next
		}
	}

	logger.warn('No watermarks found', { collectionId });
	return [];
}
