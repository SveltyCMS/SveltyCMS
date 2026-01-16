// src/utils/media/api.ts
import { logger } from '@utils/logger';

export async function updateMediaMetadata(id: string, metadataPatch: Record<string, unknown>) {
	try {
		const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata: metadataPatch })
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`HTTP ${res.status}: ${text}`);
		}
		return await res.json();
	} catch (err) {
		logger.error('updateMediaMetadata failed', err);
		throw err;
	}
}

export async function fetchWatermarksFromCollection(collectionId = 'Watermarks') {
	// Try a couple of URL shapes to accommodate different setups
	const candidates = [
		`/api/collections/${collectionId}?limit=100`,
		`/api/collections/${collectionId.toLowerCase()}?limit=100`,
		`/api/collections/${collectionId}/entries?limit=100`
	];

	for (const url of candidates) {
		try {
			const res = await fetch(url);
			if (!res.ok) continue;
			const data = await res.json();
			// Normalize common shapes
			const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [];
			return items.map((it: any) => ({
				id: it._id || it.id,
				name: it.name || it.title || `Watermark ${it._id || it.id}`,
				url: it.url || it.image?.url
			}));
		} catch (_) {
			// try next
		}
	}
	return [] as Array<{ id: string; name: string; url?: string }>;
}
