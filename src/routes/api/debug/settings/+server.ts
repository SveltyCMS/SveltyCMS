import { config } from '@src/lib/config.server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const settings = await config.getPublicSettings();
		return json({
			success: true,
			settings,
			keys: Object.keys(settings),
			setupCompleted: settings.SETUP_COMPLETED,
			siteName: settings.SITE_NAME
		});
	} catch (error) {
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined
		});
	}
};
