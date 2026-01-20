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
import { logger } from '@shared/utils/logger.server';
import type { DatabaseConfig } from '@shared/database/schemas';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const dbConfig = (await request.json()) as DatabaseConfig;

		logger.info('� Starting setup initialization...', {
			host: dbConfig.host,
			port: dbConfig.port,
			name: dbConfig.name
		});

		// STEP 1: Write private.ts - MOVED TO api/complete to prevent premature restart
		// logger.info('📝 Writing private.ts configuration file...');
		// const { writePrivateConfig } = await import('../writePrivateConfig');
		// await writePrivateConfig(dbConfig);
		// invalidateSetupCache(true); // Clear cache so system knows setup is done
		logger.info('✅ Private configuration writing deferred to completion step');

		// STEP 2: Asynchronously seed database and get first collection for quick redirect
		logger.info('Pre-scanning collections for faster redirect...');
		const { scanCompiledCollections } = await import('@shared/utils/content/scanner');
		const collections = await scanCompiledCollections();
		const firstCollection = collections.length > 0 ? { name: collections[0].name, path: collections[0].path, _id: collections[0]._id } : null;
		logger.info(`Found ${collections.length} collections. First collection for redirect: ${firstCollection?.name} (ID: ${firstCollection?._id})`);

		// Run the full seeding process
		const { initSystemFromSetup } = await import('@shared/database/seed');
		const { getSetupDatabaseAdapter } = await import('../utils');
		const { setupManager } = await import('@shared/utils/setupManager');

		const isTestMode = process.env.TEST_MODE === 'true' || request.headers.get('x-seed-sync') === 'true';

		const seedProcess = async () => {
			try {
				setupManager.isSeeding = true;
				logger.info(`📦 Getting setup database adapter for ${isTestMode ? 'synchronous' : 'background'} seeding...`);
				const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);

				// Run migrations for SQL databases (MariaDB)
				if (dbConfig.type === 'mariadb') {
					logger.info('🐘 Running MariaDB migrations...');
					try {
						// Dynamically import migrations to avoid loading if not using MariaDB
						const { runMigrations } = await import('@shared/database/mariadb/migrations');

						// Access the connection pool from the adapter implementation
						// The adapter is typed as IDBAdapter but the implementation has a 'pool' property
						const adapterImpl = dbAdapter as any;
						if (adapterImpl.pool) {
							const migrationResult = await runMigrations(adapterImpl.pool);
							if (!migrationResult.success) {
								throw new Error(`Migration failed: ${migrationResult.error}`);
							}
						} else {
							logger.warn('⚠️ MariaDB adapter does not have a pool property, skipping migrations. This may cause seeding errors.');
						}
					} catch (migrationError) {
						logger.error('❌ Migration failed:', migrationError);
						throw migrationError;
					}
				}

				logger.info(`🌱 Starting ${isTestMode ? 'synchronous' : 'background'} seeding of default data (settings, themes, collections)...`);
				await initSystemFromSetup(dbAdapter);
				logger.info(`✅ ${isTestMode ? 'Synchronous' : 'Background'} seeding completed successfully`);
				return { rolesSeeded: true, settingsSeeded: true, themesSeeded: true };
			} catch (seedError) {
				logger.error(`❌ ${isTestMode ? 'Synchronous' : 'Background'} seeding process failed:`, seedError);
				setupManager.seedingError = seedError instanceof Error ? seedError.message : String(seedError);
				throw seedError;
			} finally {
				setupManager.isSeeding = false;
			}
		};

		let seedResults = { rolesSeeded: false, settingsSeeded: false, themesSeeded: false };

		if (isTestMode) {
			logger.info('⏳ TEST_MODE detected: Awaiting seeding synchronously...');
			seedResults = await seedProcess();
		} else {
			// Changed to synchronous execution to ensure data integrity
			// Fire-and-forget caused race conditions where users completed setup before seeding finished
			logger.info('⏳ Awaiting seeding synchronously to ensure data integrity...');
			seedResults = await seedProcess();
		}

		return json({
			success: true,
			message: 'Database initialized successfully! ✨',
			firstCollection, // Return first collection info for faster redirect
			...seedResults
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
