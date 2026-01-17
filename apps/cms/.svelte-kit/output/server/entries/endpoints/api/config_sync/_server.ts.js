import { error, json } from '@sveltejs/kit';
import { configService } from '../../../../chunks/ConfigService.js';
import { invalidateSettingsCache } from '../../../../chunks/settingsService.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ locals }) => {
	if (!locals.user || !locals.isAdmin) {
		throw error(403, 'Forbidden: Administrator access required.');
	}
	try {
		const status = await configService.getStatus();
		return json(status);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Failed to get configuration status:', err);
		throw error(500, `Configuration status check failed: ${message}`);
	}
};
const POST = async ({ locals, request }) => {
	if (!locals.user || !locals.isAdmin) {
		throw error(403, 'Forbidden: Administrator access required.');
	}
	try {
		const { action, uuids, payload } = await request.json();
		switch (action) {
			case 'import': {
				const status = await configService.getStatus();
				if (status.unmetRequirements.length > 0) {
					return json(
						{
							success: false,
							message: 'Import blocked due to unmet requirements.',
							unmetRequirements: status.unmetRequirements
						},
						{ status: 409 }
					);
				}
				await configService.performImport({ changes: payload });
				invalidateSettingsCache();
				return json({
					success: true,
					message: 'Configuration imported successfully.'
				});
			}
			case 'export': {
				const result = await configService.performExport({ uuids });
				return json({
					success: true,
					message: 'Configuration exported successfully.',
					output: result
				});
			}
			default:
				return json({ success: false, message: 'Invalid action specified.' }, { status: 400 });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Configuration sync POST failed:', err);
		throw error(500, `Configuration sync failed: ${message}`);
	}
};
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
