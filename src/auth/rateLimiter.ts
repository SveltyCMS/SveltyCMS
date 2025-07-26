/**
 * @file src/auth/rateLimiter.ts
 * @description Rate Limiter
 *
 * Feature:
 * - Rate Limiting
 * - Time Window
 * - Identifier
 *
 * Multi-Tenancy Note:
 * This RateLimiter is a generic utility. To make it tenant-aware, the calling code
 * must provide a tenant-specific identifier (e.g., `${tenantId}:${userId}`).
 * For global rate limiting (e.g., by IP address), a global identifier should be used.
 */

import { dev } from '$app/environment';
import { logger } from '@utils/logger.svelte';

interface RateLimitRecord {
	count: number;
	firstAttempt: number;
}

class RateLimiter {
	private limits: Map<string, RateLimitRecord>;
	private readonly maxAttempts: number;
	private readonly timeWindowMs: number;

	constructor(maxAttempts = 5, timeWindowMs = 15 * 60 * 1000) {
		// 15 minutes default
		this.limits = new Map();
		this.maxAttempts = maxAttempts;
		this.timeWindowMs = timeWindowMs;
	}

	async checkRateLimit(identifier: string): Promise<boolean> {
		const now = Date.now();
		const record = this.limits.get(identifier); // Skip rate limiting in development

		if (dev) {
			return true;
		}

		if (!record) {
			this.limits.set(identifier, {
				count: 1,
				firstAttempt: now
			});
			return true;
		} // Reset if outside time window

		if (now - record.firstAttempt > this.timeWindowMs) {
			this.limits.set(identifier, {
				count: 1,
				firstAttempt: now
			});
			return true;
		} // Increment counter

		record.count += 1;
		this.limits.set(identifier, record); // Check if over limit

		const isAllowed = record.count <= this.maxAttempts;
		if (!isAllowed) {
			logger.warn('Rate limit exceeded', { identifier });
		}
		return isAllowed;
	}

	async resetLimit(identifier: string): Promise<void> {
		this.limits.delete(identifier);
		logger.info('Rate limit reset', { identifier });
	}

	getRemainingAttempts(identifier: string): number {
		const record = this.limits.get(identifier);
		if (!record) {
			return this.maxAttempts;
		}
		return Math.max(0, this.maxAttempts - record.count);
	}

	getTimeRemaining(identifier: string): number {
		const record = this.limits.get(identifier);
		if (!record) {
			return 0;
		}
		const remaining = this.timeWindowMs - (Date.now() - record.firstAttempt);
		return Math.max(0, remaining);
	}
}

// Export a singleton instance
export const rateLimiter = new RateLimiter();
