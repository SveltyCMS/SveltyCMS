/**
 * @file src/cacheStore/index.server.ts
 * @description Cache store initialization and access function
 * This module provides functionality to get the cache store instance based on the configured settings.
 * It supports both Redis and in-memory cache stores.
 * Features:
 * - Dynamic cache store selection based on environment configuration
 * - Access to the cache store instance for other modules
 */
import { InMemorySessionStore, RedisSessionStore } from '@src/auth/sessionStore';
import { getGlobalSetting } from '@src/stores/globalSettings';

export const getCacheStore = () => {
	if (!global.cacheStore) {
		// Initialize cache to be used
		global.cacheStore = getGlobalSetting('USE_REDIS') ? new RedisSessionStore() : new InMemorySessionStore();
	}
	return global.cacheStore;
};
