/**
 * @file src/services/webhookService.ts
 * @description Service for managing and dispatching system webhooks.
 * Allows external systems to subscribe to CMS events.
 */

import { logger } from '@utils/logger.server';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface Webhook {
	id: string;
	name: string;
	url: string;
	events: WebhookEvent[];
	active: boolean;
	secret?: string; // For signature verification
	headers?: Record<string, string>;
	lastTriggered?: string;
	failureCount?: number;
}

export type WebhookEvent = 'entry:create' | 'entry:update' | 'entry:delete' | 'entry:publish' | 'entry:unpublish' | 'media:upload' | 'media:delete';

const getDbAdapter = async () => (await import('@src/databases/db')).dbAdapter;

export class WebhookService {
	private static instance: WebhookService;

	// In-memory cache of webhooks (refreshed periodically or on change)
	private webhooksCache: Webhook[] | null = null;
	private cacheTimestamp = 0;
	private readonly CACHE_TTL = 60 * 1000; // 1 minute

	private constructor() {}

	public static getInstance(): WebhookService {
		if (!WebhookService.instance) {
			WebhookService.instance = new WebhookService();
		}
		return WebhookService.instance;
	}

	/**
	 * Dispatch an event to all subscribed webhooks
	 */
	public async trigger(event: WebhookEvent, payload: any) {
		// Don't block main thread
		this._dispatch(event, payload).catch((err) => logger.error(`Error dispatching webhook event ${event}:`, err));
	}

	private async _dispatch(event: WebhookEvent, payload: any) {
		const webhooks = await this.getWebhooks();
		const matchingHooks = webhooks.filter((wh) => wh.active && (wh.events.includes(event) || wh.events.includes('*' as any)));

		if (matchingHooks.length === 0) return;

		logger.debug(`Dispatching ${event} to ${matchingHooks.length} webhooks`);

		const promises = matchingHooks.map(async (webhook) => {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
					'X-SveltyCMS-Event': event,
					'User-Agent': 'SveltyCMS-Webhook/1.0',
					...(webhook.headers || {})
				};

				// Calculate signature if secret exists
				if (webhook.secret) {
					// TODO: Implement HMAC signature
					// headers['X-SveltyCMS-Signature'] = ...
				}

				const response = await fetch(webhook.url, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						event,
						timestamp: new Date().toISOString(),
						payload
					}),
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				// Update success stats (fire and forget)
				this.updateStatus(webhook.id, true);
			} catch (error) {
				logger.warn(`Webhook ${webhook.name} failed:`, error);
				this.updateStatus(webhook.id, false);
			}
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Get all configured webhooks
	 */
	public async getWebhooks(): Promise<Webhook[]> {
		// Simple memory cache
		if (this.webhooksCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
			return this.webhooksCache;
		}

		try {
			const db = await getDbAdapter();
			if (!db) return [];

			// We need a place to store webhooks.
			// For V1, we'll store them in 'system_settings' under a special key 'webhooks_config'
			// or assume a collection exists.
			// Let's use system_settings for simplicity as it's existing infra.

			const result = await db.systemPreferences.get<Webhook[]>('webhooks_config', 'system');

			this.webhooksCache = result.success && result.data ? result.data : [];
			this.cacheTimestamp = Date.now();

			return this.webhooksCache;
		} catch (e) {
			logger.error('Failed to load webhooks:', e);
			return [];
		}
	}

	/**
	 * Save a new webhook or update existing
	 */
	public async saveWebhook(webhook: Partial<Webhook>): Promise<Webhook> {
		const db = await getDbAdapter();
		if (!db) throw new Error('DB not available');

		const current = await this.getWebhooks();
		let updated: Webhook[];

		const newWebhook = {
			...webhook,
			id: webhook.id || uuidv4(),
			active: webhook.active ?? true,
			events: webhook.events || [],
			name: webhook.name || 'Untitled Webhook',
			url: webhook.url || ''
		} as Webhook;

		if (webhook.id) {
			updated = current.map((w) => (w.id === webhook.id ? newWebhook : w));
		} else {
			updated = [...current, newWebhook];
		}

		await db.systemPreferences.set('webhooks_config', updated, 'system');
		this.webhooksCache = updated; // Update cache immediately

		return newWebhook;
	}

	public async deleteWebhook(id: string) {
		const db = await getDbAdapter();
		if (!db) return;

		const current = await this.getWebhooks();
		const updated = current.filter((w) => w.id !== id);

		await db.systemPreferences.set('webhooks_config', updated, 'system');
		this.webhooksCache = updated;
	}

	private async updateStatus(id: string, success: boolean) {
		// We won't write to DB on every trigger to save IO
		// In a real system, we'd use a separate stats store or Redis
		// For now, we update in-memory cache only if it's fresh enough
		if (this.webhooksCache) {
			const hook = this.webhooksCache.find((w) => w.id === id);
			if (hook) {
				hook.lastTriggered = new Date().toISOString();
				if (!success) {
					hook.failureCount = (hook.failureCount || 0) + 1;
				}
			}
		}
	}
}

export const webhookService = WebhookService.getInstance();
