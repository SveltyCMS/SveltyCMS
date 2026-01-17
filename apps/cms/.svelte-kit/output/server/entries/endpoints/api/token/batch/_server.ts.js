import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth } from '../../../../../chunks/db.js';
import { object, picklist, array, string, parse } from 'valibot';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const batchTokenActionSchema = object({
	tokenIds: array(string()),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});
const POST = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals;
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const parsed = parse(batchTokenActionSchema, body);
		const { tokenIds, action } = parsed;
		if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
			throw error(400, 'At least one token ID is required.');
		}
		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			try {
				const filter = { tenantId };
				const tokensResult = await auth.getAllTokens(filter);
				if (!tokensResult.success || !tokensResult.data) {
					throw new Error('Failed to retrieve tokens');
				}
				const tokenSet = new Set(tokensResult.data.map((t) => t.token));
				const allOwned = tokenIds.every((id) => tokenSet.has(id));
				if (!allOwned) {
					logger.warn('Attempt to act on tokens outside of tenant', { userId: user?._id, tenantId, requestedTokenIds: tokenIds });
					throw error(403, 'Forbidden: One or more tokens do not belong to your tenant or do not exist.');
				}
			} catch (verifyErr) {
				logger.error('Failed to verify tenant token ownership', { error: verifyErr });
				throw error(500, 'Failed to verify token ownership');
			}
		}
		let successMessage = '';
		switch (action) {
			case 'delete': {
				await auth.deleteTokens(tokenIds, tenantId);
				successMessage = 'Tokens deleted successfully.';
				break;
			}
			case 'block': {
				await auth.blockTokens(tokenIds, tenantId);
				successMessage = 'Tokens blocked successfully.';
				break;
			}
			case 'unblock': {
				await auth.unblockTokens(tokenIds, tenantId);
				successMessage = 'Tokens unblocked successfully.';
				break;
			}
		}
		cacheService.delete('tokens', tenantId).catch((err) => {
			logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
		});
		logger.info(`Batch token action '${action}' completed.`, {
			affectedIds: tokenIds,
			executedBy: user?._id,
			tenantId
		});
		return json({ success: true, message: successMessage });
	} catch (err) {
		if (err && typeof err === 'object' && 'name' in err && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for token batch API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in token batch API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
