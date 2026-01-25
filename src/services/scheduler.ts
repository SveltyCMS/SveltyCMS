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
	private static instance: SchedulerService;
	private intervalId: NodeJS.Timeout | null = null;
	private isRunning = false;
	private readonly CHECK_INTERVAL = 60 * 1000; // Check every minute

	private constructor() {}

	public static getInstance(): SchedulerService {
		if (!SchedulerService.instance) {
			SchedulerService.instance = new SchedulerService();
		}
		return SchedulerService.instance;
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
		if (this.isRunning) {
			logger.debug('Scheduler already running, skipping cycle');
			return;
		}

		this.isRunning = true;

		try {
			const db = await getDbAdapter();
			if (!db) {
				logger.warn('Database adapter not available for scheduler');
				return;
			}

			// 1. Get all nodes with 'schedule' status
			// We can't easily query JSON fields across all DB types, so we fetch all 'schedule' items
			// and filter in memory. Assuming the number of *pending* scheduled items is small (hundreds, not millions).
			// If this scales up, we need a dedicated index/column for 'scheduledAt'.

			// Using getStructure 'flat' to get all nodes
			// Optimized: We should probably add a specific query method for this if volume grows
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await db.content.nodes.getStructure('flat', { status: StatusTypes.schedule } as any);

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
			logger.error('Scheduler check failed:', error instanceof Error ? error.message : JSON.stringify(error));
			if (error instanceof Error && error.stack) {
				logger.debug(error.stack);
			}
		} finally {
			this.isRunning = false;
		}
	}
}

export const scheduler = SchedulerService.getInstance();
