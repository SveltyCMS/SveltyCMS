/**
 * @file src/routes/api/setup/status/+server.ts
 * @description API endpoint to check if setup is complete
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// Check if environment files exist and have required content
		const envPath = resolve(process.cwd(), '.env');
		const envLocalPath = resolve(process.cwd(), '.env.local');

		// Check if both environment files exist
		if (!existsSync(envPath) || !existsSync(envLocalPath)) {
			return json({
				isComplete: false,
				setupCompleted: false,
				siteName: null,
				message: 'Environment files not found'
			});
		}

		// Read and validate environment files
		const envContent = readFileSync(envPath, 'utf8');
		const envLocalContent = readFileSync(envLocalPath, 'utf8');

		// Check for required database configuration in .env
		const hasDbType = envContent.includes('DB_TYPE=');
		const hasDbHost = envContent.includes('DB_HOST=');
		const hasDbPort = envContent.includes('DB_PORT=');
		const hasJwtSecret = envContent.includes('JWT_SECRET_KEY=');
		const hasEncryptionKey = envContent.includes('ENCRYPTION_KEY=');

		// Check for required database configuration in .env.local
		const hasDbName = envLocalContent.includes('DB_NAME=');
		const hasDbUser = envLocalContent.includes('DB_USER=');
		const hasDbPassword = envLocalContent.includes('DB_PASSWORD=');

		// Extract and validate key values
		const dbHostMatch = envContent.match(/DB_HOST=([^\r\n]+)/);
		const hasValidDbHost = dbHostMatch && dbHostMatch[1] && dbHostMatch[1].trim() !== '';

		const dbNameMatch = envLocalContent.match(/DB_NAME=([^\r\n]+)/);
		const hasValidDbName = dbNameMatch && dbNameMatch[1] && dbNameMatch[1].trim() !== '';

		const jwtMatch = envContent.match(/JWT_SECRET_KEY=([^\r\n]+)/);
		const hasValidJwt = jwtMatch && jwtMatch[1] && jwtMatch[1].trim() !== '';

		const isComplete =
			hasDbType &&
			hasDbHost &&
			hasDbPort &&
			hasDbName &&
			hasDbUser &&
			hasDbPassword &&
			hasJwtSecret &&
			hasEncryptionKey &&
			hasValidDbHost &&
			hasValidDbName &&
			hasValidJwt;

		return json({
			isComplete,
			setupCompleted: isComplete,
			siteName: isComplete ? 'Configured' : null,
			message: isComplete ? 'Setup is complete' : 'Setup is not complete'
		});
	} catch (error) {
		console.error('Setup status error:', error);
		return json({
			isComplete: false,
			setupCompleted: false,
			siteName: null,
			message: 'Setup is not complete',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
};
