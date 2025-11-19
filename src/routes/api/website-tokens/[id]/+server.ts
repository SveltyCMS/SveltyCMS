import { error } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';

export async function DELETE({ locals, params }) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		throw error(500, 'Database not available');
	}

	const { id } = params;

	if (!id) {
		throw error(400, 'Token ID is required');
	}

	const result = await dbAdapter.websiteTokens.delete(id as DatabaseId);

	if (!result.success) {
		logger.error(`Failed to delete website token ${id}:`, result.error);
		throw error(500, 'Failed to delete website token');
	}

	return new Response(null, { status: 204 });
}
