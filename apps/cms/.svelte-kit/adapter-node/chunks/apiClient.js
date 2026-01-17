import { t as toaster } from './store.svelte.js';
import { logger } from './logger.js';
import 'clsx';
import './schemas.js';
function showToast(message, type = 'info', timeout = 3e3) {
	try {
		toaster.create({
			title: type.charAt(0).toUpperCase() + type.slice(1),
			// Title Case (Success, Error, Info, Warning)
			description: message,
			type,
			duration: timeout
		});
	} catch (err) {
		logger.error('[toast] Failed to show toast:', err);
	}
}
async function fetchApi(endpoint, options) {
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
		const err = error;
		logger.error(`[API Client Error]`, err);
		return { success: false, error: err.message };
	}
}
function batchUpdateEntries(collectionId, payload) {
	const { ids, status, ...otherFields } = payload;
	if (status && ids && Array.isArray(ids)) {
		return fetchApi(`/api/collections/${collectionId}/${ids[0]}/status`, {
			method: 'PATCH',
			body: JSON.stringify({ status, entries: ids, ...otherFields })
		});
	}
	throw new Error('Batch updates only supported for status changes');
}
function deleteEntry(collectionId, entryId) {
	return fetchApi(`/api/collections/${collectionId}/${entryId}`, {
		method: 'DELETE'
	});
}
function batchDeleteEntries(collectionId, entryIds) {
	return fetchApi(`/api/collections/${collectionId}/batch`, {
		method: 'POST',
		body: JSON.stringify({ action: 'delete', entryIds })
	});
}
function createClones(collectionId, entries) {
	return fetchApi(`/api/collections/${collectionId}/batch-clone`, {
		method: 'POST',
		body: JSON.stringify({ entries })
	});
}
async function getCollections(options = {}) {
	const params = new URLSearchParams(options);
	const endpoint = `/api/collections?${params.toString()}`;
	return fetchApi(endpoint, { method: 'GET' });
}
export { batchDeleteEntries as a, batchUpdateEntries as b, createClones as c, deleteEntry as d, getCollections as g, showToast as s };
//# sourceMappingURL=apiClient.js.map
