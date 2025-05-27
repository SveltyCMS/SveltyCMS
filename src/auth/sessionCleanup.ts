/**
 * @file src/auth/sessionCleanup.ts
 * @description Session cleanup utilities for managing expired and rotated sessions
 *
 * This module provides functionality to:
 * - Clean up expired sessions
 * - Clean up rotated sessions past their grace period
 * - Manage session metrics
 * - Schedule periodic cleanup tasks
 *
 * Features:
 * - Automatic cleanup of expired sessions
 * - Grace period management for rotated sessions
 * - Performance monitoring
 * - Configurable cleanup intervals
 *
 * Usage:
 * Import and call startSessionCleanup() to begin automatic cleanup
 */

import { auth } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { cleanupSessionMetrics } from '@src/hooks.server';

// Cleanup configuration
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
const METRICS_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

let cleanupInterval: NodeJS.Timeout | null = null;
let metricsCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Clean up expired sessions and rotated sessions past grace period
 */
export async function cleanupExpiredSessions(): Promise<{
	expiredSessions: number;
	rotatedSessions: number;
	totalCleaned: number;
}> {
	if (!auth) {
		logger.warn('Auth service not available for session cleanup');
		return { expiredSessions: 0, rotatedSessions: 0, totalCleaned: 0 };
	}

	try {
		const startTime = performance.now();

		// Clean up regular expired sessions
		const expiredSessions = await auth.deleteExpiredSessions();

		// Clean up rotated sessions past grace period (if the method exists)
		let rotatedSessions = 0;
		if (typeof auth.cleanupRotatedSessions === 'function') {
			rotatedSessions = await auth.cleanupRotatedSessions();
		}

		const totalCleaned = expiredSessions + rotatedSessions;
		const duration = performance.now() - startTime;

		if (totalCleaned > 0) {
			logger.info(`Session cleanup completed: ${expiredSessions} expired, ${rotatedSessions} rotated sessions cleaned in ${duration.toFixed(2)}ms`);
		} else {
			logger.debug(`Session cleanup completed: no sessions to clean (${duration.toFixed(2)}ms)`);
		}

		return { expiredSessions, rotatedSessions, totalCleaned };
	} catch (error) {
		const message = `Session cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
		logger.error(message);
		throw new Error(message);
	}
}

/**
 * Start automatic session cleanup
 */
export function startSessionCleanup(): void {
	if (cleanupInterval) {
		logger.warn('Session cleanup is already running');
		return;
	}

	logger.info(`Starting automatic session cleanup (interval: ${CLEANUP_INTERVAL / 1000}s)`);

	// Initial cleanup
	cleanupExpiredSessions().catch((error) => {
		logger.error(`Initial session cleanup failed: ${error.message}`);
	});

	// Schedule regular cleanup
	cleanupInterval = setInterval(async () => {
		try {
			await cleanupExpiredSessions();
		} catch (error) {
			logger.error(`Scheduled session cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}, CLEANUP_INTERVAL);

	// Schedule metrics cleanup
	metricsCleanupInterval = setInterval(() => {
		try {
			cleanupSessionMetrics();
		} catch (error) {
			logger.error(`Session metrics cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}, METRICS_CLEANUP_INTERVAL);

	logger.info('Session cleanup scheduled successfully');
}

/**
 * Stop automatic session cleanup
 */
export function stopSessionCleanup(): void {
	if (cleanupInterval) {
		clearInterval(cleanupInterval);
		cleanupInterval = null;
		logger.info('Session cleanup stopped');
	}

	if (metricsCleanupInterval) {
		clearInterval(metricsCleanupInterval);
		metricsCleanupInterval = null;
		logger.info('Session metrics cleanup stopped');
	}
}

/**
 * Get cleanup status
 */
export function getCleanupStatus(): {
	isRunning: boolean;
	interval: number;
	metricsInterval: number;
} {
	return {
		isRunning: cleanupInterval !== null,
		interval: CLEANUP_INTERVAL,
		metricsInterval: METRICS_CLEANUP_INTERVAL
	};
}

/**
 * Force immediate cleanup (useful for testing or manual triggers)
 */
export async function forceCleanup(): Promise<{
	expiredSessions: number;
	rotatedSessions: number;
	totalCleaned: number;
}> {
	logger.info('Force cleanup triggered');
	const result = await cleanupExpiredSessions();
	cleanupSessionMetrics();
	return result;
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
	logger.info('SIGTERM received, stopping session cleanup');
	stopSessionCleanup();
});

process.on('SIGINT', () => {
	logger.info('SIGINT received, stopping session cleanup');
	stopSessionCleanup();
});
