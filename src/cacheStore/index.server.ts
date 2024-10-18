// Cache
import { privateEnv } from '@root/config/private';
import { InMemorySessionStore } from '@src/auth/InMemoryCacheStore';
import { RedisCacheStore } from '@src/auth/RedisCacheStore';

if (!global.cacheStore) {
    // Initialize cache to be used 
	global.cacheStore = privateEnv.USE_REDIS ? new RedisCacheStore() : new InMemorySessionStore();
}

export const cacheStore = global.cacheStore;
