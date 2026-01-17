import { json, error } from '@sveltejs/kit';
import { dbAdapter } from '@shared/database/db';
import { logger } from '@shared/utils/logger.server';
import crypto from 'crypto';

export async function GET({ locals, url }: { locals: App.Locals; url: URL }): Promise<Response> {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		throw error(500, 'Database not available');
	}

	const page = Number(url.searchParams.get('page') ?? 1);
	const limit = Number(url.searchParams.get('limit') ?? 10);
	const sort = url.searchParams.get('sort') ?? 'createdAt';
	const order = url.searchParams.get('order') ?? 'desc';

	// Note: The current dbAdapter.websiteTokens.getAll() doesn't support filter parameter
	// Search/filter functionality would need to be added to the database adapter
	// For now, we fetch all and can filter client-side if needed

	const result = await dbAdapter.websiteTokens.getAll({
		limit,
		skip: (page - 1) * limit,
		sort,
		order
	});

	if (!result.success) {
		logger.error('Failed to fetch website tokens:', result.error);
		throw error(500, 'Failed to fetch website tokens');
	}

	return json({
		data: result.data.data,
		pagination: {
			totalItems: result.data.total
		}
	});
}

export async function POST({ locals, request }: { locals: App.Locals; request: Request }): Promise<Response> {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		throw error(500, 'Database not available');
	}

	const { name } = await request.json();

	if (!name) {
		throw error(400, 'Token name is required');
	}

	const existingToken = await dbAdapter.websiteTokens.getByName(name);
	if (existingToken.success && existingToken.data) {
		throw error(409, 'A token with this name already exists');
	}

	const token = `sv_${crypto.randomBytes(24).toString('hex')}`;

	const result = await dbAdapter.websiteTokens.create({
		name,
		token,
		updatedAt: new Date().toISOString() as import('@shared/database/dbInterface').ISODateString,
		createdBy: locals.user._id
	});

	if (!result.success) {
		logger.error('Failed to create website token:', result.error);
		throw error(500, 'Failed to create website token');
	}

	return json(result.data, { status: 201 });
}
