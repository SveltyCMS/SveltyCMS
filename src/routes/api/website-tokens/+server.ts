import crypto from 'node:crypto';
import { dbAdapter } from '@src/databases/db';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ locals, url }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database not available', 500, 'DB_UNAVAILABLE');
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
		throw new AppError('Failed to fetch website tokens', 500, 'FETCH_TOKENS_FAILED');
	}

	return json({
		data: result.data.data,
		pagination: {
			totalItems: result.data.total
		}
	});
});

export const POST = apiHandler(async ({ locals, request }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database not available', 500, 'DB_UNAVAILABLE');
	}

	const { name, permissions, expiresAt } = await request.json();

	if (!name) {
		throw new AppError('Token name is required', 400, 'MISSING_NAME');
	}

	const existingToken = await dbAdapter.websiteTokens.getByName(name);
	if (existingToken.success && existingToken.data) {
		throw new AppError('A token with this name already exists', 409, 'TOKEN_EXISTS');
	}

	const token = `sv_${crypto.randomBytes(24).toString('hex')}`;

	const result = await dbAdapter.websiteTokens.create({
		name,
		token,
		updatedAt: new Date().toISOString() as import('@databases/db-interface').ISODateString,
		createdBy: locals.user._id,
		permissions: permissions || [],
		expiresAt: expiresAt || undefined
	});

	if (!result.success) {
		logger.error('Failed to create website token:', result.error);
		throw new AppError('Failed to create website token', 500, 'CREATE_TOKEN_FAILED');
	}

	return json(result.data, { status: 201 });
});
