/**
 * @file src/routes/api/config/test-db/+server.ts
 * @description API endpoint to test database connection settings.
 */
import { json } from '@sveltejs/kit';
import mongoose from 'mongoose';
import mariadb from 'mariadb';
import { checkApiPermission } from '@api/permissions';

export async function POST({ request, cookies }) {
	// Check permissions using centralized system
	await checkApiPermission(cookies, 'config:settings');

	const config = await request.json();
	const { DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = config;

	if (DB_TYPE === 'mongodb') {
		try {
			let connectionString;
			if (DB_HOST.startsWith('mongodb+srv://')) {
				connectionString = `mongodb+srv://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST.replace('mongodb+srv://', '')}/${DB_NAME}?retryWrites=true&w=majority`;
			} else {
				connectionString = `mongodb://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST.replace('mongodb://', '')}:${DB_PORT}/${DB_NAME}?authSource=admin`;
			}

			// Mongoose caches connections, so we create a new one to test.
			const testConnection = await mongoose.createConnection(connectionString).asPromise();
			await testConnection.db.admin().ping();
			await testConnection.close(); // Close the temporary connection

			return json({ success: true, message: 'MongoDB connection successful!' });
		} catch (error: any) {
			console.error('MongoDB test connection error:', error);
			return json({ success: false, message: `MongoDB connection failed: ${error.message}` }, { status: 400 });
		}
	} else if (DB_TYPE === 'mariadb') {
		let connection;
		try {
			connection = await mariadb.createConnection({
				host: DB_HOST,
				port: DB_PORT,
				user: DB_USER,
				password: DB_PASSWORD,
				database: DB_NAME
			});
			await connection.ping();
			return json({ success: true, message: 'MariaDB connection successful!' });
		} catch (error: any) {
			console.error('MariaDB test connection error:', error);
			return json({ success: false, message: `MariaDB connection failed: ${error.message}` }, { status: 400 });
		} finally {
			if (connection) await connection.end();
		}
	}

	return json({ success: false, message: 'Invalid database type provided.' }, { status: 400 });
}
