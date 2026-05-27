/**
 * @file src/databases/cache/redis-store.ts
 * @description Redis cache store implementation with tag support and TTL.
 */

import { logger } from '@utils/logger';
import type { CacheStore } from './types';
import type { RedisClientType } from 'redis';

// Redis cache store implementation with tag support and TTL.
export class RedisStore implements CacheStore {
	private client: RedisClientType | null = null;
	private isInitialized = false;

	constructor(
		private readonly config: {
			URL: string;
			PASSWORD?: string;
			RETRY_ATTEMPTS: number;
			RETRY_DELAY: number;
		}
	) {}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		// Use DatabaseResilience for automatic retry with exponential backoff
		const { getDatabaseResilience } = await import('@src/databases/database-resilience');
		const resilience = getDatabaseResilience({
			maxAttempts: this.config.RETRY_ATTEMPTS,
			initialDelayMs: this.config.RETRY_DELAY,
			backoffMultiplier: 2,
			maxDelayMs: 30_000,
			jitterMs: 500
		});

		try {
			await resilience.executeWithRetry(async () => {
				const { createClient } = await import('redis');
				this.client = createClient({
					url: this.config.URL,
					password: this.config.PASSWORD
				});
				this.client?.on('error', (err) => logger.error('Redis Client Error', err));
				await this.client?.connect();
				this.isInitialized = true;
				logger.info('Redis client connected successfully.');
			}, 'Redis Connection');
		} catch (err) {
			this.isInitialized = false;
			throw err;
		}
	}

	private async ensureReady(): Promise<void> {
		if (!(this.client && this.isInitialized)) {
			throw new Error('Redis client is not initialized');
		}
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}

	async get<T>(key: string): Promise<T | null> {
		await this.ensureReady();
		const value = await this.client?.get(key);
		try {
			return value ? (JSON.parse(value) as T) : null;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void> {
		await this.ensureReady();
		const multi = this.client?.multi();
		multi?.set(key, JSON.stringify(value), { EX: ttlSeconds });

		if (tags) {
			for (const tag of tags) {
				const tagKey = `tag:${tag}`;
				multi?.sAdd(tagKey, key);
				multi?.expire(tagKey, ttlSeconds);
			}
		}

		await multi?.exec();
	}

	async delete(key: string | string[]): Promise<void> {
		await this.ensureReady();
		const keys = Array.isArray(key) ? key : [key];
		await this.client?.del(keys);
	}

	async clearByPattern(pattern: string): Promise<void> {
		await this.ensureReady();
		let cursor = '0';
		do {
			const result = await this.client?.scan(cursor, {
				MATCH: pattern,
				COUNT: 100
			});
			if (!result) break;
			cursor = result.cursor;
			if (result.keys.length > 0) {
				await this.client?.del(result.keys);
			}
		} while (cursor !== '0');
	}

	async clearByTags(tags: string[]): Promise<void> {
		await this.ensureReady();
		for (const tag of tags) {
			const tagKey = `tag:${tag}`;
			const keys = await this.client?.sMembers(tagKey);
			if (keys && keys.length > 0) {
				await this.client?.del(keys);
				await this.client?.del(tagKey);
			}
		}
	}

	async disconnect(): Promise<void> {
		if (this.client?.isOpen) {
			try {
				await this.client.quit();
			} catch (e) {
				logger.warn('Error during Redis disconnect:', e);
			}
		}
		this.isInitialized = false;
		logger.info('Redis connection closed.');
	}

	getClient(): RedisClientType | null {
		return this.client;
	}
}
