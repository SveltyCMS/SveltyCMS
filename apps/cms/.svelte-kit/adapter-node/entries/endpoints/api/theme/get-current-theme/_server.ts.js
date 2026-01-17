import { T as ThemeManager } from '../../../../../chunks/themeManager.js';
import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
const themeManager = ThemeManager.getInstance();
const GET = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}
		const currentTheme = await themeManager.getTheme(tenantId);
		if (currentTheme) {
			logger.info('Current theme fetched successfully', { theme: currentTheme.name, tenantId });
			return json(currentTheme, { status: 200 });
		} else {
			logger.warn('No active theme found for tenant', { tenantId });
			return json({ error: 'No active theme found.' }, { status: 404 });
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error fetching current theme:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error fetching current theme: ${errorMessage}` }, { status: 500 });
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
