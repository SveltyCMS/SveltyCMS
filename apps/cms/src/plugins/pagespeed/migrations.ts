/**
 * @file src/plugins/pagespeed/migrations.ts
 * @description Database migrations for PageSpeed plugin
 */

import type { PluginMigration } from '../types';
import type { PageSpeedResult } from './types';
import type { IDBAdapter } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';

// Create plugin_pagespeed_results table
export const createPageSpeedResultsTable: PluginMigration = {
	id: '001_create_pagespeed_results_table',
	pluginId: 'pagespeed',
	version: 1,
	description: 'Create plugin_pagespeed_results table with indexes',

	async up(dbAdapter: IDBAdapter) {
		logger.info('Creating plugin_pagespeed_results table...');

		// Create initial record to ensure table exists
		// The table will be created automatically by the dbAdapter
		const testRecord = {
			entryId: '__INIT__',
			collectionId: '__INIT__',
			tenantId: 'system',
			language: 'en',
			device: 'mobile' as const,
			url: 'https://example.com',
			performanceScore: 0,
			fetchedAt: new Date()
		};

		const result = await dbAdapter.crud.insert<PageSpeedResult>('plugin_pagespeed_results', testRecord);

		if (result.success) {
			// Delete the init record
			await dbAdapter.crud.deleteMany('plugin_pagespeed_results', {
				entryId: '__INIT__'
			} as any);
			logger.info('✅ plugin_pagespeed_results table created');
		} else {
			throw new Error(`Failed to create table: ${result.error?.message}`);
		}

		// Note: Indexes are typically created by the database adapter
		// For MongoDB, you might want to add explicit index creation here
		// For now, we rely on the adapter's default behavior
	}
};

// All PageSpeed plugin migrations
export const migrations: PluginMigration[] = [createPageSpeedResultsTable];
