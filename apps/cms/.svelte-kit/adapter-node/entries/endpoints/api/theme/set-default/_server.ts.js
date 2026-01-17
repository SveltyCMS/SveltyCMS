import { T as ThemeManager } from '../../../../../chunks/themeManager.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const themeManager = ThemeManager.getInstance();
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}
	const { themeId } = await request.json();
	if (!themeId || typeof themeId !== 'string') {
		logger.warn(`Invalid theme ID provided: ${themeId}`, { tenantId });
		throw error(400, 'Invalid theme ID.');
	}
	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}
		await dbAdapter.themes.setDefault(themeId);
		await themeManager.refresh();
		const updatedTheme = await themeManager.getTheme(tenantId);
		logger.info(`Default theme successfully set to '${updatedTheme.name}' by user '${user._id}'.`, { tenantId });
		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error setting default theme:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error setting default theme: ${errorMessage}` }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
