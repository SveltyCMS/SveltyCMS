import { getDatabaseConnectionString, getDatabaseConfig, loadPrivateConfig } from '../src/databases/config-state';
import mongoose from 'mongoose';

async function testConnection() {
	console.log('--- Testing MongoDB Connection ---');

	// 1. Check Config
	const config = await loadPrivateConfig(true);
	console.log(
		'Loaded Config:',
		JSON.stringify(
			config,
			(key, value) => {
				if (key === 'DB_PASSWORD' || key === 'JWT_SECRET_KEY' || key === 'ENCRYPTION_KEY') return '***';
				return value;
			},
			2
		)
	);

	const dbConfig = getDatabaseConfig();
	console.log(
		'Database Config:',
		JSON.stringify(
			dbConfig,
			(key, value) => {
				if (key === 'password') return '***';
				return value;
			},
			2
		)
	);

	const connectionString = getDatabaseConnectionString();
	console.log('Generated Connection String:', connectionString.replace(/:([^@]+)@/, ':***@'));

	// 2. Try Connect
	try {
		console.log('Attempting to connect to MongoDB...');
		await mongoose.connect(connectionString, {
			serverSelectionTimeoutMS: 5000,
			connectTimeoutMS: 5000
		});
		console.log('✅ Successfully connected to MongoDB!');

		// 3. Simple Operation
		if (!mongoose.connection.db) {
			throw new Error('Database connection not established');
		}
		const admin = mongoose.connection.db.admin();
		const info = await admin.serverStatus();
		console.log('Server Status:', info.version);

		await mongoose.disconnect();
		console.log('Disconnected.');
	} catch (error) {
		console.error('❌ Connection failed:', (error as Error).message);
		process.exit(1);
	}
}

testConnection();
