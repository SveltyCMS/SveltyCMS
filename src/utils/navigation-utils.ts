/**
 * @file src/utils/navigationUtils.ts
 * @description  GUI-first navigation via uuids/mode for SveltyCMS using SvelteKit's built-in systems
 */

const browser = typeof window !== 'undefined';

import type { ModeType } from '@src/stores/collection-store.svelte.ts';
import { preloadData } from '$app/navigation';
import { logger } from './logger';

// ============================================================================
// PRELOADING
// ============================================================================

const preloadTimers = new Map<string, number>();
export const PRELOAD_DELAY = 200; // Configurable delay to prevent aggressive prefetching

export function preloadEntry(entryId: string, currentPath: string, delay: number = PRELOAD_DELAY): void {
	const existingTimer = preloadTimers.get(entryId);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	const timer = setTimeout(async () => {
		try {
			const url = new URL(currentPath, window.location.origin);
			url.searchParams.set('edit', entryId);
			await preloadData(url.pathname + url.search);
			logger.debug(`[Preload] Entry ${entryId.substring(0, 8)}`);
		} catch (error) {
			logger.warn('[Preload ERROR]', error);
		} finally {
			preloadTimers.delete(entryId);
		}
	}, delay);

	preloadTimers.set(entryId, timer as unknown as number);
}

export function cancelPreload(entryId: string): void {
	const timer = preloadTimers.get(entryId);
	if (timer) {
		clearTimeout(timer);
		preloadTimers.delete(entryId);
	}
}

// ============================================================================
// URL REFLECTION
// ============================================================================

export function reflectModeInURL(mode: ModeType, entryId?: string, options: { replaceState?: boolean } = {}): void {
	if (!browser) {
		return;
	}

	const url = new URL(window.location.href);
	url.searchParams.delete('edit');
	url.searchParams.delete('create');

	if (mode === 'edit' && entryId) {
		url.searchParams.set('edit', entryId);
	} else if (mode === 'create') {
		url.searchParams.set('create', 'true');
	}

	const method = options.replaceState ? 'replaceState' : 'pushState';
	window.history[method]({}, '', url.toString());
	logger.debug(`[URL] ${mode}${entryId ? ` (${entryId.substring(0, 8)})` : ''}`);
}

// ============================================================================
// URL PARSING
// ============================================================================

export interface ParsedURL {
	collectionPath: string;
	entryId?: string;
	language: string;
	mode: ModeType;
}

export function parseURLToMode(url: URL): ParsedURL {
	const editParam = url.searchParams.get('edit');
	const createParam = url.searchParams.get('create');

	let mode: ModeType = 'view';
	let entryId: string | undefined;

	if (editParam) {
		mode = 'edit';
		entryId = editParam;
	} else if (createParam === 'true') {
		mode = 'create';
	}

	const pathParts = url.pathname.split('/').filter(Boolean);
	return {
		mode,
		entryId,
		language: pathParts[0] || 'en',
		collectionPath: pathParts.slice(1).join('/')
	};
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

export function invalidateCollectionEntries(collectionId: string): void {
	// SvelteKit will refetch on next navigation
	logger.debug(`[Cache] Collection ${collectionId} - will refetch on next load`);
}

export const navigationUtils = {
	preloadEntry,
	cancelPreload,
	reflectModeInURL,
	parseURLToMode,
	invalidateCollectionEntries
};

export default navigationUtils;
