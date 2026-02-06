/**
 * @file src/services/scheduler.ts
 * @description Background service for handling scheduled content publishing.
 * Checks for entries with 'schedule' status and a passed '_scheduled' timestamp.
 */

import { logger } from '@utils/logger.server';
import { StatusTypes } from '@src/content/types';
import { webhookService } from './webhookService';

// Lazy load adapter to avoid circular deps during init
const getDbAdapter = async () => (await import('@src/databases/db')).dbAdapter;

export class SchedulerService {
	private intervalId: NodeJS.Timeout | null = null;
	private isRunning = false;
	private readonly CHECK_INTERVAL = 60 * 1000; // Check every minute

	private constructor() {}

	public static getInstance(): SchedulerService {
		const g = globalThis as any;
		if (!g.__SVELTY_SCHEDULER_INSTANCE__) {
			g.__SVELTY_SCHEDULER_INSTANCE__ = new SchedulerService();
		}
		return g.__SVELTY_SCHEDULER_INSTANCE__;
	}

	/**
	 * Start the scheduler background task
	 */
	public start() {
		if (this.intervalId) return;

		logger.info('🕒 Scheduler service started');

		// Run immediately on start
		this.checkScheduledItems().catch((err) => logger.error('Error in initial schedule check:', err));

		this.intervalId = setInterval(() => {
			this.checkScheduledItems().catch((err) => logger.error('Error in periodic schedule check:', err));
		}, this.CHECK_INTERVAL);
	}

	/**
	 * Stop the scheduler
	 */
	public stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			logger.info('🛑 Scheduler service stopped');
		}
	}

	/**
	 * Main logic to find and publish scheduled items
	 */
	public async checkScheduledItems() {
		if (this.isRunning || !this.intervalId) {
			if (!this.intervalId) logger.debug('Scheduler stopped, skipping cycle');
			return;
		}

		this.isRunning = true;

		try {
			const db = await getDbAdapter();
			if (!this.intervalId) return; // Check if stopped during await

			if (!db) {
				logger.debug('Scheduler skipped: Database adapter not available');
				return;
			}

			// 1. Connection Guard
			// Skip cycle if DB is not connected to avoid unnecessary errors during boot
			if (typeof db.isConnected === 'function' && !db.isConnected()) {
				logger.debug('Scheduler skipped: DB not connected yet');
				return;
			}

			// 2. Capability Guard
			// Ensure the adapter supports the required features
			const caps = typeof db.getCapabilities === 'function' ? db.getCapabilities() : null;
			if (caps && !caps.supportsAggregation) {
				logger.debug('Scheduler skipped: DB does not support required features');
				return;
			}

			// 3. Explicit Dependency Declaration (Lazy Activation)
			// Declare dependency on the content module and attempt activation
			if (db.ensureContent) {
				try {
					await db.ensureContent();
					if (!this.intervalId) return; // Check if stopped during await
				} catch (err) {
					logger.debug('Scheduler skipped: content module not ready yet');
					return;
				}
			}

			// 4. Get all nodes with 'schedule' status
			// We can't easily query JSON fields across all DB types, so we fetch all 'schedule' items
			// and filter in memory. Assuming the number of *pending* scheduled items is small.
			const result = await db.content.nodes.getStructure('flat', { status: StatusTypes.schedule } as any);
			if (!this.intervalId) return; // Check if stopped during await

			if (!result.success || !result.data) {
				return;
			}

			const now = Date.now();
			const nodesToPublish = result.data.filter((node) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const scheduledTime = (node as any).data?._scheduled || (node as any)._scheduled;
				return scheduledTime && Number(scheduledTime) <= now;
			});

			if (nodesToPublish.length === 0) {
				return;
			}

			logger.info(`Found ${nodesToPublish.length} items ready for publishing`);

			// 2. Publish items
			for (const node of nodesToPublish) {
				if (!this.intervalId) return; // Stop processing if scheduler stopped

				try {
					logger.info(`Publishing scheduled item: ${node.name} (${node._id})`);

					// Update to 'publish' status and remove _scheduled flag
					// We preserve other data
					const updateData = {
						status: StatusTypes.publish,
						data: {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							...(((node as any).data as object) || {}),
							_scheduled: null // Clear the schedule timestamp
						},
						updatedAt: new Date().toISOString()
					};

					// Use db adapter to update
					// Note: Using path or ID depending on what's robust. Content module uses path usually.
					if (node.path) {
						await db.content.nodes.update(node.path, updateData as any);

						// Trigger 'publish' webhook
						webhookService.trigger('entry:publish', {
							id: node._id,
							collection: node.collectionDef?.name || 'unknown',
							title: node.name
						});
					} else {
						logger.warn(`Node ${node._id} has no path, skipping publish`);
					}
				} catch (err) {
					logger.error(`Failed to publish scheduled item ${node._id}:`, err);
				}
			}
		} catch (error) {
			// Ignore errors if stopped (likely "module runner closed")
			if (!this.intervalId) return;

			const errorMessage = error instanceof Error ? error.message : String(error);

			// Suppress "Vite module runner has been closed" errors which are common during HMR/Restarts
			if (errorMessage.includes('Vite module runner has been closed')) {
				logger.debug('Scheduler: Vite module runner has been closed (HMR detected)');
				return;
			}

			logger.error('Scheduler check failed:', errorMessage);
			if (error instanceof Error && error.stack) {
				logger.debug(error.stack);
			}
		} finally {
			this.isRunning = false;
		}
	}
}

const g = globalThis as any;

// On module load, if an instance already exists, stop it AND remove it
// This forces getInstance() to create a NEW instance with the NEW module context
if (g.__SVELTY_SCHEDULER_INSTANCE__) {
	try {
		g.__SVELTY_SCHEDULER_INSTANCE__.stop();
	} catch (e) {
		// Ignore stop errors on old instances
	}
	delete g.__SVELTY_SCHEDULER_INSTANCE__;
}

export const scheduler = SchedulerService.getInstance();
