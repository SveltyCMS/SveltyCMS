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
	const { themeId, customCss } = await request.json();
	if (!themeId || typeof themeId !== 'string') {
		logger.warn(`Invalid theme ID provided: ${themeId}`, { tenantId });
		throw error(400, 'Invalid theme ID.');
	}
	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}
		const themeResult = await dbAdapter.themes.update(themeId, { customCss });
		if (!themeResult.success || !themeResult.data) {
			logger.warn(`Theme '${themeId}' does not exist or update failed for this tenant.`, { tenantId });
			throw error(404, `Theme '${themeId}' does not exist or update failed.`);
		}
		const updatedTheme = themeResult.data;
		await themeManager.refresh();
		logger.info(`Theme '${updatedTheme.name}' custom CSS successfully updated by user '${user._id}'.`, { tenantId });
		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error updating theme custom CSS:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error updating theme custom CSS: ${errorMessage}` }, { status: 500 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
