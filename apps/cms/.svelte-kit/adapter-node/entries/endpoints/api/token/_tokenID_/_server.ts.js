import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth } from '../../../../../chunks/db.js';
import { object, any, parse } from 'valibot';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
function isDatabaseResult(val) {
	return !!val && typeof val === 'object' && 'success' in val;
}
const editTokenSchema = object({
	newTokenData: any()
	// Keep it flexible, specific validation can be added
});
const PUT = async ({ request, params, locals }) => {
	const { user, tenantId } = locals;
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { newTokenData } = parse(editTokenSchema, body);
		if (!auth) {
			logger.error('Database authentication adapter not initialized');
			throw error(500, 'Database authentication not available');
		}
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const tokenToUpdate = await auth.getTokenByValue(tokenId);
			if (!tokenToUpdate || tokenToUpdate.tenantId !== tenantId) {
				logger.warn('Attempt to edit a token belonging to another tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetTokenId: tokenId,
					targetTenantId: tokenToUpdate?.tenantId
				});
				throw error(403, 'Forbidden: You can only edit tokens within your own tenant.');
			}
		}
		let updateResult = null;
		const possibleAuth = auth;
		if (possibleAuth && typeof possibleAuth === 'object' && 'updateToken' in possibleAuth && typeof possibleAuth.updateToken === 'function') {
			updateResult = await possibleAuth.updateToken(tokenId, newTokenData);
		} else {
			const { TokenAdapter } = await import('../../../../../chunks/authToken.js');
			const tokenAdapter = new TokenAdapter();
			updateResult = await tokenAdapter.updateToken(tokenId, newTokenData);
		}
		let updated = false;
		if (typeof updateResult === 'boolean') {
			updated = updateResult;
		} else if (isDatabaseResult(updateResult)) {
			updated = updateResult.success === true;
		} else if (updateResult && typeof updateResult === 'object') {
			updated = true;
		}
		if (!updated) {
			throw error(404, 'Token not found or not modified');
		}
		logger.info('Token updated successfully', { tokenId, updateData: newTokenData, tenantId });
		cacheService.delete('tokens', tenantId).catch((err) => {
			logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
		});
		return json({ success: true, message: 'Token updated successfully.' });
	} catch (err) {
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for edit token API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in edit token API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
const DELETE = async ({ params, locals }) => {
	const { user, tenantId } = locals;
	try {
		const tokenId = params.tokenID;
		if (!tokenId) {
			throw error(400, 'Token ID is required in the URL path.');
		}
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			if (!auth) {
				throw error(500, 'Auth service is not initialized');
			}
			const tokenToDelete = await auth.getTokenByValue(tokenId);
			if (!tokenToDelete) {
				logger.warn('Attempt to delete a non-existent token.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetTokenId: tokenId
				});
				throw error(404, 'Token not found.');
			}
		}
		let deletedCount;
		const maybeAuth = auth;
		if (maybeAuth && typeof maybeAuth === 'object' && 'deleteTokens' in maybeAuth && typeof maybeAuth.deleteTokens === 'function') {
			const result = await maybeAuth.deleteTokens([tokenId]);
			if (typeof result === 'number') {
				deletedCount = result;
			} else if (result && typeof result === 'object' && 'deletedCount' in result) {
				deletedCount = result.deletedCount;
			}
		} else {
			const { TokenAdapter } = await import('../../../../../chunks/authToken.js');
			const tokenAdapter = new TokenAdapter();
			const result = await tokenAdapter.deleteTokens([tokenId]);
			if (result.success && result.data) {
				deletedCount = result.data.deletedCount;
			}
		}
		if (!deletedCount) {
			throw error(404, 'Token not found');
		}
		cacheService.delete('tokens', tenantId).catch((err) => {
			logger.warn(`Failed to invalidate tokens cache: ${err.message}`);
		});
		logger.info(`Token ${tokenId} deleted successfully`, { executedBy: user?._id, tenantId });
		return json({ success: true, message: 'Token deleted successfully.' });
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in delete token API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
export { DELETE, PUT };
//# sourceMappingURL=_server.ts.js.map
