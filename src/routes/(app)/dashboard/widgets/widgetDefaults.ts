// src/routes/(app)/dashboard/widgets/widgetDefaults.ts
/**
 * @file widgetDefaults.ts
 * @description Default configuration for different widget categories in enterprise CMS
 *
 * Categories:
 * - monitoring: Real-time system monitoring (CPU, Memory, Cache)
 * - logs: Activity logs and recent events
 * - content: Content listings and media
 * - static: Announcements, messages, configuration
 */

export type WidgetCategory = 'monitoring' | 'logs' | 'content' | 'static';

export interface WidgetDefaults {
	showRefreshButton: boolean;
	cacheKey?: (widgetId: string) => string;
	cacheTTL?: number;
	retryCount: number;
	retryDelay: number;
}

export const WIDGET_DEFAULTS: Record<WidgetCategory, WidgetDefaults> = {
	// Real-time monitoring widgets (CPU, Memory, Cache, Performance)
	monitoring: {
		showRefreshButton: true,
		cacheKey: undefined, // No cache - always fresh data
		retryCount: 3,
		retryDelay: 1000
	},

	// Activity logs and recent events
	logs: {
		showRefreshButton: false, // Auto-poll only
		cacheKey: undefined,
		retryCount: 2,
		retryDelay: 1000
	},

	// Content and media listings
	content: {
		showRefreshButton: false,
		cacheKey: (id: string) => `content-${id}`,
		cacheTTL: 120000, // 2 minutes
		retryCount: 3,
		retryDelay: 1000
	},

	// Static content (messages, announcements)
	static: {
		showRefreshButton: false,
		cacheKey: (id: string) => `static-${id}`,
		cacheTTL: 300000, // 5 minutes
		retryCount: 3,
		retryDelay: 2000
	}
};

/**
 * Get default configuration for a widget category
 */
export function getWidgetDefaults(
	category: WidgetCategory,
	widgetId?: string
): Partial<{
	showRefreshButton: boolean;
	cacheKey: string | undefined;
	cacheTTL: number;
	retryCount: number;
	retryDelay: number;
}> {
	const defaults = WIDGET_DEFAULTS[category];
	return {
		showRefreshButton: defaults.showRefreshButton,
		cacheKey: defaults.cacheKey && widgetId ? defaults.cacheKey(widgetId) : undefined,
		cacheTTL: defaults.cacheTTL,
		retryCount: defaults.retryCount,
		retryDelay: defaults.retryDelay
	};
}
