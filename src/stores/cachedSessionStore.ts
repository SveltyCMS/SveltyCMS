import { writable } from 'svelte/store';

interface CachedSession {
	data: any;
	expiresAt: number;
}

const MAX_CACHE_SIZE = 1000; // Adjust as needed
const SESSION_EXPIRATION = 60 * 60 * 1000; // 1 hour

const cachedSessionStore = writable<Map<string, CachedSession>>(new Map());

function set(key: string, data: any, expiresIn: number = SESSION_EXPIRATION) {
	const expiresAt = Date.now() + expiresIn;
	const cache = $cachedSessionStore;

	// Simple eviction strategy: remove oldest item if cache is full
	if (cache.size >= MAX_CACHE_SIZE) {
		const oldestItem = [...cache.entries()].reduce(
			(acc, [key, value]) => (value.expiresAt < acc.expiresAt ? value : acc),
			cache.get(cache.keys().next().value)
		);
		cache.delete(oldestItem[0]);
	}

	cache.set(key, { data, expiresAt });
}

function get(key: string) {
	const cachedSession = $cachedSessionStore.get(key);
	if (!cachedSession || cachedSession.expiresAt < Date.now()) {
		return null;
	}
	return cachedSession.data;
}

function remove(key: string) {
	$cachedSessionStore.delete(key);
}

export { cachedSessionStore, set, get, remove };
