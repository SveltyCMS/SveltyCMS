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
import { logger } from '@utils/logger.server';
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

		// STEP 2: Asynchronously seed database and get first collection for quick redirect
		logger.info('Pre-scanning collections for faster redirect...');
		const { scanCompiledCollections } = await import('@src/content/collectionScanner');
		const collections = await scanCompiledCollections();
		const firstCollection = collections.length > 0 ? { name: collections[0].name, path: collections[0].path, _id: collections[0]._id } : null;
		logger.info(`Found ${collections.length} collections. First collection for redirect: ${firstCollection?.name} (ID: ${firstCollection?._id})`);

		// Run the full seeding process and WAIT for it to complete
		// This is critical for CI/testing where we need roles to exist before tests run
		logger.info('📥 Importing seeding modules...');
		const { initSystemFromSetup } = await import('../seed');
		const { getSetupDatabaseAdapter } = await import('../utils');
		logger.info('✅ Modules imported');

		logger.info('📦 Getting setup database adapter for seeding...');
		const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);
		logger.info('✅ Database adapter obtained');

		logger.info('🌱 Calling initSystemFromSetup...');
		const result = await initSystemFromSetup(dbAdapter);
		logger.info('✅ initSystemFromSetup completed', { result });

		logger.info('========================================');
		logger.info('✅ ALL SEEDING COMPLETED SUCCESSFULLY');
		logger.info('========================================');

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
