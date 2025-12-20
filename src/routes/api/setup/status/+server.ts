/**
 * @file src/routes/api/setup/status/+server.ts
 * @description API endpoint to check background setup status.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setupManager } from '../setupManager';

export const GET: RequestHandler = async () => {
	return json({
		isSeeding: setupManager.isSeeding,
		progress: setupManager.progress,
		error: setupManager.seedingError
	});
};
