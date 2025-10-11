/**
 * @file src/routes/api/setup/seed/+server.ts
 * @description Writes private.ts and seeds default data
 * @summary
 *  - Called when user clicks "Next" after successful DB test
 *  - STEP 1: Writes private.ts with DB credentials and security keys
 *  - STEP 2: Seeds settings and themes
 *  - Gives Vite time to pick up new private.ts file
 *  - Returns quickly so user can proceed to admin form
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import type { DatabaseConfig } from '@src/databases/schemas';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = (await request.json()) as DatabaseConfig;

		logger.info('� Starting setup initialization...', {
			host: dbConfig.host,
			port: dbConfig.port,
			name: dbConfig.name
		});

		// STEP 1: Write private.ts with database credentials
		logger.info('📝 Writing private.ts configuration file...');
		const { writePrivateConfig } = await import('../writePrivateConfig');
		await writePrivateConfig(dbConfig);
		logger.info('✅ Private configuration file written');

		// STEP 2: Seed database with default data
		const { initSystemFromSetup } = await import('../seed');
		const { getSetupDatabaseAdapter } = await import('../utils');

		logger.info('📦 Getting setup database adapter...');
		const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

		logger.info('🌱 Seeding default data (\x1b[34msettings, themes, collections\x1b[0m)...');
		const { firstCollection } = await initSystemFromSetup(dbAdapter);

		// Success message removed - "System initialization completed" already logged in seed.ts
		// Hook will log the final completion with timing

		return json({
			success: true,
			message: 'Database initialized successfully! ✨',
			firstCollection // Return first collection info for faster redirect
		});
	} catch (error) {
		const errorDetails = {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			type: error?.constructor?.name,
			fullError: error
		};

		logger.error('❌ Setup initialization failed:', errorDetails);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
				details: errorDetails,
				message: 'Initialization failed, but you can continue. Data will be created on first use.'
			},
			{ status: 500 }
		);
	}
};
