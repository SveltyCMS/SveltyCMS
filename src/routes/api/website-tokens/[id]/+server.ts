import { dbAdapter } from '@src/databases/db';
import type { DatabaseId } from '@src/databases/dbInterface';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const DELETE = apiHandler(async ({ locals, params }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database not available', 500, 'DB_UNAVAILABLE');
	}

	const { id } = params;

	if (!id) {
		throw new AppError('Token ID is required', 400, 'MISSING_ID');
	}

	const result = await dbAdapter.websiteTokens.delete(id as DatabaseId);

	if (!result.success) {
		logger.error(`Failed to delete website token ${id}:`, result.error);
		throw new AppError('Failed to delete website token', 500, 'DELETE_TOKEN_FAILED');
	}

	return new Response(null, { status: 204 });
});
