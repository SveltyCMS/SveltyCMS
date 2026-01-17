import { getPrivateSettingSync } from '../../chunks/settingsService.js';
import { publicEnv } from '../../chunks/globalSettings.svelte.js';
import { contentManager } from '../../chunks/ContentManager.js';
import { b as dbInitPromise } from '../../chunks/db.js';
import { redirect, error } from '@sveltejs/kit';
import { l as logger } from '../../chunks/logger.server.js';
const load = async ({ locals, url }) => {
	const { user, tenantId, roles } = locals;
	const tenantRoles = roles || [];
	if (!user) {
		logger.debug('User is not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}
	try {
		await dbInitPromise;
		const healthStatus = contentManager.getHealthStatus();
		if (healthStatus.state !== 'initialized') {
			logger.warn('ContentManager not initialized in page load', {
				state: healthStatus.state
			});
		}
		logger.debug('System is ready, proceeding with page load.', { tenantId });
		if (url.pathname !== '/') {
			const userRole2 = tenantRoles.find((role) => role._id === user?.role);
			const isAdmin2 = Boolean(userRole2?.isAdmin);
			return {
				user: { ...user, isAdmin: isAdmin2 },
				permissions: locals.permissions
			};
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const redirectLanguage = url.searchParams.get('contentLanguage') || user.locale || publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
		const redirectUrl = await contentManager.getFirstCollectionRedirectUrl(redirectLanguage, tenantId);
		if (redirectUrl) {
			logger.info(`Redirecting to first collection: ${redirectUrl}`, { tenantId });
			throw redirect(302, redirectUrl);
		}
		logger.warn('No collections found for user. Redirecting to collectionbuilder.', { tenantId });
		throw redirect(302, '/config/collectionbuilder');
		const userRole = tenantRoles.find((role) => role._id === user?.role);
		const isAdmin = Boolean(userRole?.isAdmin);
		return {
			user: { ...user, isAdmin },
			permissions: locals.permissions
		};
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'status' in err) {
			throw err;
		}
		logger.error('Unexpected error in root page load function', { error: err, tenantId });
		const message = err instanceof Error ? err.message : 'An unexpected error occurred';
		throw error(500, message);
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
