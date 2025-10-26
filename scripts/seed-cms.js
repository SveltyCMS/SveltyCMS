// scripts/seed-cms.js
// This script mimics the setup wizard's seed step for CI/CD
import { writePrivateConfig } from '../src/routes/api/setup/writePrivateConfig.js';
import { initSystemFromSetup } from '../src/routes/api/setup/seed.js';
import { getSetupDatabaseAdapter } from '../src/routes/api/setup/utils.js';

async function main() {
	console.log('🚀 Starting SveltyCMS database seeding...');

	const dbConfig = {
		type: 'mongodb',
		host: process.env.MONGO_HOST || 'localhost',
		port: parseInt(process.env.MONGO_PORT || '27017', 10),
		name: process.env.MONGO_DB || 'SveltyCMS',
		user: process.env.MONGO_USER || '',
		password: process.env.MONGO_PASS || ''
	};

	console.log(`📝 Database config: ${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`);

	// Step 1: Write config/private.ts (same as /api/setup/seed)
	console.log('📝 Writing private.ts configuration...');
	await writePrivateConfig(dbConfig);
	console.log('✅ Private configuration written');

	// Step 2: Get database adapter and seed default data (same as /api/setup/seed)
	console.log('🔌 Connecting to database...');
	const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);
	console.log('✅ Database connected');

	console.log('🌱 Seeding default data (settings, themes, collections)...');
	await initSystemFromSetup(dbAdapter);
	console.log('✅ Database seeding completed successfully!');

	// Cleanup
	await dbAdapter.disconnect();
	console.log('👋 Database connection closed');
}

main().catch((err) => {
	console.error('❌ Seeding failed:', err);
	console.error(err.stack);
	process.exit(1);
});
