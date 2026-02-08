/**
 * @file src/plugins/pagespeed/migrations.ts
 * @description Database migrations for PageSpeed plugin
 */

import type { PluginMigration } from '../types';
import type { PageSpeedResult } from './types';
import type { IDBAdapter } from '@databases/dbInterface';
import { logger } from '@utils/logger.server';

// Validate plugin_pagespeed_results table exists (created via db:push from Drizzle schema)
export const createPageSpeedResultsTable: PluginMigration = {
	id: '001_create_pagespeed_results_table',
	pluginId: 'pagespeed',
	version: 1,
	description: 'Validate plugin_pagespeed_results table exists',

	async up(dbAdapter: IDBAdapter) {
		logger.info('Validating plugin_pagespeed_results table...');

		// Read-based validation: check the table exists by querying it
		const result = await dbAdapter.crud.findMany<PageSpeedResult>('pluginPagespeedResults', {});

		if (result.success) {
			logger.info('✅ plugin_pagespeed_results table validated');
		} else {
			logger.warn('⚠ plugin_pagespeed_results table not found. Run `bun run db:push` to create it from the Drizzle schema.');
		}
	}
};

// All PageSpeed plugin migrations
export const migrations: PluginMigration[] = [createPageSpeedResultsTable];
