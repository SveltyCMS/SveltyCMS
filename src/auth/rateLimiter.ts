import { dev } from '$app/environment';

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
		const record = this.limits.get(identifier);

		// Skip rate limiting in development
		if (dev) {
			return true;
		}

		if (!record) {
			this.limits.set(identifier, {
				count: 1,
				firstAttempt: now
			});
			return true;
		}

		// Reset if outside time window
		if (now - record.firstAttempt > this.timeWindowMs) {
			this.limits.set(identifier, {
				count: 1,
				firstAttempt: now
			});
			return true;
		}

		// Increment counter
		record.count += 1;
		this.limits.set(identifier, record);

		// Check if over limit
		return record.count <= this.maxAttempts;
	}

	async resetLimit(identifier: string): Promise<void> {
		this.limits.delete(identifier);
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
