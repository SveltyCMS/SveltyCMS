/**
 * @file src/routes/api/setup/status/+server.ts
 * @description API endpoint for checking setup status
 *
 * Features:
 * - Checks for private.ts file
 * - Checks if setup is complete
 * - Returns JSON response with setup status
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSetupComplete } from '@shared/utils/setupCheck';
import fs from 'node:fs';
import path from 'node:path';

export const GET: RequestHandler = async () => {
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const privateTsExists = fs.existsSync(privateConfigPath);
	const setupComplete = isSetupComplete();

	return json({
		setupComplete,
		reason: privateTsExists ? 'privateTsPresent' : 'missingConfig',
		details: {
			privateTsExists,
			configValid: setupComplete
		}
	});
};
