import { error, json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../chunks/db.js';
import { l as logger } from '../../../../chunks/logger.server.js';
import crypto from 'crypto';
async function GET({ locals, url }) {
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
async function POST({ locals, request }) {
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
		updatedAt: /* @__PURE__ */ new Date().toISOString(),
		createdBy: locals.user._id
	});
	if (!result.success) {
		logger.error('Failed to create website token:', result.error);
		throw error(500, 'Failed to create website token');
	}
	return json(result.data, { status: 201 });
}
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
