/**
 * @file src/services/automation/eventBus.ts
 * @description Central event bus for CMS automation triggers.
 * Emits lifecycle events from CRUD operations and dispatches
 * them to the AutomationService for processing.
 *
 * Features:
 * - Type-safe event emission
 * - Non-blocking dispatch (fire-and-forget)
 * - Listener registration for automation flows
 * - Integration point for dbAdapter CRUD hooks
 */

import { logger } from '@utils/logger.server';
import type { AutomationEvent, AutomationEventPayload } from './types';

type EventListener = (payload: AutomationEventPayload) => void | Promise<void>;

/**
 * Singleton event bus for CMS lifecycle events.
 * Bridges CRUD operations → AutomationService.
 */
class AutomationEventBus {
	private listeners = new Map<AutomationEvent | '*', Set<EventListener>>();
	private static instance: AutomationEventBus;

	private constructor() {}

	public static getInstance(): AutomationEventBus {
		if (!AutomationEventBus.instance) {
			AutomationEventBus.instance = new AutomationEventBus();
		}
		return AutomationEventBus.instance;
	}

	/**
	 * Register a listener for a specific event or all events ('*').
	 * Returns an unsubscribe function.
	 */
	public on(event: AutomationEvent | '*', listener: EventListener): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener);

		return () => {
			this.listeners.get(event)?.delete(listener);
		};
	}

	/**
	 * Emit an event to all registered listeners.
	 * Non-blocking: errors in listeners don't propagate to the caller.
	 */
	public emit(event: AutomationEvent, payload: Omit<AutomationEventPayload, 'event' | 'timestamp'>): void {
		const fullPayload: AutomationEventPayload = {
			...payload,
			event,
			timestamp: new Date().toISOString()
		};

		// Fire specific listeners
		const specific = this.listeners.get(event);
		if (specific) {
			for (const listener of specific) {
				try {
					const result = listener(fullPayload);
					// If listener returns a promise, catch errors silently
					if (result instanceof Promise) {
						result.catch((err) => logger.error(`Automation listener error for ${event}:`, err));
					}
				} catch (err) {
					logger.error(`Automation listener error for ${event}:`, err);
				}
			}
		}

		// Fire wildcard listeners
		const wildcard = this.listeners.get('*');
		if (wildcard) {
			for (const listener of wildcard) {
				try {
					const result = listener(fullPayload);
					if (result instanceof Promise) {
						result.catch((err) => logger.error(`Automation wildcard listener error:`, err));
					}
				} catch (err) {
					logger.error(`Automation wildcard listener error:`, err);
				}
			}
		}

		logger.debug(`EventBus: emitted ${event} (${(specific?.size ?? 0) + (wildcard?.size ?? 0)} listeners)`);
	}

	/** Remove all listeners (useful for testing/cleanup) */
	public clear(): void {
		this.listeners.clear();
	}

	/** Get count of registered listeners */
	public listenerCount(event?: AutomationEvent | '*'): number {
		if (event) {
			return this.listeners.get(event)?.size ?? 0;
		}
		let total = 0;
		for (const set of this.listeners.values()) {
			total += set.size;
		}
		return total;
	}
}

export const eventBus = AutomationEventBus.getInstance();
