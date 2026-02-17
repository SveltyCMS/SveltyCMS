/**
 * @file src/routes/api/version-check/+server.ts
 * @description API endpoint for checking application version against remote releases.
 */

import { versionCheckService } from '@src/services/VersionCheckService';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/apiHandler';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = apiHandler(async ({ url }) => {
	const checkUpdates = url.searchParams.get('checkUpdates') === 'true';
	const result = await versionCheckService.checkVersion({ checkUpdates });

	return json(result, {
		status: 200 // Consistent 200 OK unless critical failure
	});
});
