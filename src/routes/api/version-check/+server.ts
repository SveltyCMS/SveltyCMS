/**
 * @file src/routes/api/version-check/+server.ts
 * @description API endpoint for checking application version against remote releases.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { versionCheckService, type VersionCheckResponse } from '@src/services/VersionCheckService';

export const GET: RequestHandler = async ({ url }) => {
	const checkUpdates = url.searchParams.get('checkUpdates') === 'true';
	const result = await versionCheckService.getInstance().checkVersion({ checkUpdates });

	return json<VersionCheckResponse>(result, {
		status: result.status === 'error' ? 200 : 200
	});
};
