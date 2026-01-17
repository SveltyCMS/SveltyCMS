import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const PATCH = async ({ params, request, locals, fetch }) => {
	const { user } = locals;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	const { id } = params;
	if (!id) {
		throw error(400, 'Media ID is required');
	}
	try {
		const body = await request.json();
		const { x, y } = body;
		if (typeof x !== 'number' || typeof y !== 'number') {
			throw error(400, 'x and y must be numbers');
		}
		if (x < 0 || x > 100 || y < 0 || y > 100) {
			throw error(400, 'x and y must be between 0 and 100');
		}
		const response = await fetch(`/api/media/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				metadata: {
					focalPoint: { x, y }
				}
			})
		});
		if (!response.ok) {
			const errorText = await response.text();
			logger.error('Failed to update focal point via media API', {
				mediaId: id,
				status: response.status,
				error: errorText
			});
			throw error(response.status, errorText || 'Failed to update focal point');
		}
		logger.info('Focal point updated', {
			mediaId: id,
			focalPoint: { x, y },
			userId: user._id.toString()
		});
		return json({
			success: true,
			data: { focalPoint: { x, y } }
		});
	} catch (err) {
		if (err.status) throw err;
		logger.error('Error updating focal point', { error: err, mediaId: id });
		throw error(500, 'Internal server error');
	}
};
export { PATCH };
//# sourceMappingURL=_server.ts.js.map
