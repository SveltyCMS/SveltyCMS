/**
 * @file src/plugins/pagespeed/index.ts
 * @description Google PageSpeed Insights plugin for SveltyCMS
 *
 * This plugin:
 * - Fetches and caches PageSpeed Insights metrics for entries
 * - Displays performance scores in EntryList
 * - Provides language-aware URL derivation
 * - Enforces SSRF protection
 */

import type { Plugin, PluginContext, PluginEntryData } from '../types';
import { migrations } from './migrations';
import { getMultipleCachedResults } from './service';
import { logger } from '@utils/logger.server';

/**
 * SSR hook for PageSpeed plugin
 * Enriches entry list with cached PageSpeed data
 */
async function ssrHook(
	context: PluginContext,
	entries: Array<Record<string, unknown>>
): Promise<PluginEntryData[]> {
	const { dbAdapter, collectionSchema, language, tenantId } = context;
	
	try {
		// Extract entry IDs
		const entryIds = entries.map((e) => e._id as string).filter(Boolean);
		
		if (entryIds.length === 0) {
			return [];
		}
		
		// Get cached results for all entries (mobile by default for list view)
		const cachedResults = await getMultipleCachedResults(
			dbAdapter,
			entryIds,
			collectionSchema._id as string,
			language,
			'mobile',
			tenantId
		);
		
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
					fetchedAt: result.fetchedAt
				},
				updatedAt: new Date(result.fetchedAt)
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

/**
 * PageSpeed Insights plugin definition
 */
export const pageSpeedPlugin: Plugin = {
	metadata: {
		id: 'pagespeed',
		name: 'Google PageSpeed Insights',
		version: '1.0.0',
		description: 'Monitors page performance using Google PageSpeed Insights',
		author: 'SveltyCMS',
		enabled: true
	},
	
	migrations,
	
	ssrHook,
	
	ui: {
		columns: [
			{
				id: 'performance_score',
				label: 'Performance',
				width: '120px',
				sortable: false
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
		public: {
			// No public settings for now
		},
		private: {
			// API key is stored in system settings: GOOGLE_PAGESPEED_API_KEY
		}
	},
	
	// Empty enabledCollections = enabled for all collections
	enabledCollections: []
};
