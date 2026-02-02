/**
 * @file src/routes/api/version-check/+server.ts
 * @description API endpoint for checking application version against remote releases.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { versionCheckService } from '@src/services/VersionCheckService';
import { apiHandler } from '@utils/apiHandler';

export const GET: RequestHandler = apiHandler(async ({ url }) => {
	const checkUpdates = url.searchParams.get('checkUpdates') === 'true';
	const result = await versionCheckService.checkVersion({ checkUpdates });

	return json(result, {
		status: 200 // Consistent 200 OK unless critical failure
	});
});
