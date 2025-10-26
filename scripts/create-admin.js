// scripts/create-admin.js
// This script mimics the setup wizard's complete step for CI/CD
import { Auth } from '../src/databases/auth/index.js';
import { setupAdminSchema } from '../src/utils/formSchemas.js';
import { safeParse } from 'valibot';
import { getSetupDatabaseAdapter } from '../src/routes/api/setup/utils.js';

async function main() {
	console.log('🚀 Starting admin user creation...');

	const dbConfig = {
		type: 'mongodb',
		host: process.env.MONGO_HOST || 'localhost',
		port: parseInt(process.env.MONGO_PORT || '27017', 10),
		name: process.env.MONGO_DB || 'SveltyCMS',
		user: process.env.MONGO_USER || '',
		password: process.env.MONGO_PASS || ''
	};

	const admin = {
		username: process.env.ADMIN_USER || 'admin',
		email: process.env.ADMIN_EMAIL || 'admin@example.com',
		password: process.env.ADMIN_PASS || 'Admin123!',
		confirmPassword: process.env.ADMIN_PASS || 'Admin123!'
	};

	console.log(`👤 Creating admin user: ${admin.username} (${admin.email})`);

	// Validate admin data (same as /api/setup/complete)
	const validation = safeParse(setupAdminSchema, admin);
	if (!validation.success) {
		console.error('❌ Invalid admin user data:');
		validation.issues.forEach((issue) => {
			console.error(`  - ${issue.path?.join('.')}: ${issue.message}`);
		});
		process.exit(1);
	}

	// Connect to database
	console.log('🔌 Connecting to database...');
	const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig);
	console.log('✅ Database connected');

	// Create admin user (same as /api/setup/complete)
	console.log('👤 Creating administrator account...');
	const auth = new Auth(dbAdapter);

	try {
		const user = await auth.createUser({
			username: admin.username,
			email: admin.email,
			password: admin.password,
			role: 'admin',
			isActive: true,
			emailVerified: true
		});
		console.log(`✅ Admin user created successfully! ID: ${user._id}`);
	} catch (error) {
		if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
			console.log('ℹ️  Admin user already exists, skipping creation');
		} else {
			throw error;
		}
	}

	// Cleanup
	await dbAdapter.disconnect();
	console.log('👋 Database connection closed');
	console.log('✅ Setup complete! Admin user is ready.');
}

main().catch((err) => {
	console.error('❌ Admin creation failed:', err);
	console.error(err.stack);
	process.exit(1);
});
