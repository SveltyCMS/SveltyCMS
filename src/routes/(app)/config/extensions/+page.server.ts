/**
 * @file src/routes/(app)/config/extensions/+page.server.ts
 * @description Server-side logic for the extensions management page.
 */
import { pluginRegistry } from '@src/plugins';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;

	if (!user) {
		throw redirect(302, '/login');
	}

	// Permission Checks (Allow admins for now)
	if (user.role !== 'admin') {
		throw error(403, 'Insufficient permissions');
	}

	// --- Plugins Data ---
	const tenantId = locals.tenantId || 'default';
	const allPlugins = pluginRegistry.getAll();

	const plugins = await Promise.all(
		allPlugins.map(async (p) => {
			let missingConfig = false;
			const configUrl = '/config/systemsetting';

			// Check persisted state
			const state = await pluginRegistry.getPluginState(p.metadata.id, tenantId);
			const enabled = state ? state.enabled : p.metadata.enabled;

			if (p.metadata.id === 'pagespeed') {
				missingConfig = !getPrivateSettingSync('GOOGLE_PAGESPEED_API_KEY' as any);
			}

			return {
				name: p.metadata.id,
				displayName: p.metadata.name,
				version: p.metadata.version,
				description: p.metadata.description,
				author: p.metadata.author,
				icon: p.metadata.icon,
				enabled,
				missingConfig,
				configUrl
			};
		})
	);

	return {
		plugins,
		tenantId
	};
};
