import { json, error } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';
import crypto from 'crypto';

export async function GET({ locals, url }) {
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
	const search = url.searchParams.get('search') ?? '';

	const filter: any = {};
	if (search) {
		filter.name = { $regex: search, $options: 'i' };
	}

	for (const [key, value] of url.searchParams.entries()) {
		if (key !== 'page' && key !== 'limit' && key !== 'sort' && key !== 'order' && key !== 'search') {
			filter[key] = { $regex: value, $options: 'i' };
		}
	}

	const result = await dbAdapter.websiteTokens.getAll({
		limit,
		skip: (page - 1) * limit,
		sort,
		order,
		filter
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

export async function POST({ locals, request }) {
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
		createdBy: locals.user._id
	});

	if (!result.success) {
		logger.error('Failed to create website token:', result.error);
		throw error(500, 'Failed to create website token');
	}

	return json(result.data, { status: 201 });
}
