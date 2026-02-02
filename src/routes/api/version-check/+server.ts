import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { versionCheckService } from '@src/services/VersionCheckService';
import { apiHandler } from '@utils/apiHandler';

export const GET: RequestHandler = apiHandler(async ({ url }) => {
	const checkUpdates = url.searchParams.get('checkUpdates') === 'true';
	const result = await versionCheckService.checkVersion({ checkUpdates });

	return json(result, {
		status: result.status === 'error' ? 200 : 200 // Consistent 200 OK unless critical failure
	});
});
