/**
 * @file src/plugins/pagespeed/index.ts
 * @description Google PageSpeed Insights plugin for SveltyCMS
 *
 * Features:
 * - SSR hook to enrich entry list with cached PageSpeed data
 * - Plugin component to display PageSpeed data in entry list
 * - Plugin action to refresh PageSpeed data
 */

import { logger } from '@utils/logger.server';
import type { Plugin, PluginContext, PluginEntryData } from '../types';
import { migrations } from './migrations';
import { getMultipleCachedResults } from './service';

/**
 * SSR hook for PageSpeed plugin
 * Enriches entry list with cached PageSpeed data
 */
async function ssrHook(context: PluginContext, entries: Record<string, unknown>[]): Promise<PluginEntryData[]> {
	const { dbAdapter, collectionSchema, language, tenantId } = context;

	try {
		// Extract entry IDs
		const entryIds = entries.map((e) => e._id as string).filter(Boolean);

		if (entryIds.length === 0) {
			return [];
		}

		// Get cached results for all entries (mobile by default for list view)
		const cachedResults = await getMultipleCachedResults(dbAdapter, entryIds, collectionSchema._id as string, language, 'mobile', tenantId);

		// Build plugin data array
		const pluginData: PluginEntryData[] = [];

		for (const [entryId, result] of cachedResults.entries()) {
			pluginData.push({
				entryId,
				data: {
					performanceScore: result.performanceScore,
					fcp: result.fcp,
					lcp: result.lcp,
					cls: result.cls,
					fetchedAt: new Date(result.fetchedAt).toISOString()
				},
				updatedAt: new Date(result.fetchedAt).toISOString() as any
			});
		}

		logger.debug('PageSpeed SSR hook executed', {
			collectionId: collectionSchema._id,
			language,
			entriesCount: entries.length,
			resultsCount: pluginData.length
		});

		return pluginData;
	} catch (error) {
		logger.error('PageSpeed SSR hook failed', { error });
		return [];
	}
}

// PageSpeed Insights plugin definition
export const pageSpeedPlugin: Plugin = {
	metadata: {
		id: 'pagespeed',
		name: 'Google PageSpeed Insights',
		version: '1.0.0',
		description: 'Monitors page performance using Google PageSpeed Insights',
		author: 'SveltyCMS',
		icon: 'mdi:speedometer',
		enabled: false
	},

	migrations,

	ssrHook,

	ui: {
		columns: [
			{
				id: 'performance_score',
				label: 'Performance',
				width: '120px',
				sortable: false,
				component: 'score', // Renders src/plugins/pagespeed/components/score.svelte via PluginComponent
				props: {
					score: 'performanceScore' // Maps entry.pluginData.performanceScore -> component prop 'score'
				}
			}
		],
		actions: [
			{
				id: 'refresh_pagespeed',
				label: 'Refresh PageSpeed',
				icon: 'mdi:refresh',
				handler: 'refreshPageSpeed'
			}
		]
	},

	config: {
		public: {},
		private: {}
	},

	enabledCollections: []
};
