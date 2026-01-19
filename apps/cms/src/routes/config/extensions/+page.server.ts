/**
 * @file apps/cms/src/routes/config/extensions/+page.server.ts
 * @description Server-side logic for the extensions page
 */
import { pluginRegistry } from '@cms/plugins';
import type { PageServerLoad } from './$types';
import { getPrivateSettingSync } from '@shared/services/settingsService';
import { redirect, error } from '@sveltejs/kit';
import { logger } from '@shared/utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, roles: tenantRoles } = locals;

	if (!user) {
		logger.warn('User not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}

	// Permission Checks
	// Combined permission: config:plugins OR config:widgetManagement OR config:themeManagement
	// If user has ANY of these, they can access the page, but tabs might be restricted.
	const canManagePlugins = user.permissions?.includes('config:plugins') || user.role === 'admin' || tenantRoles.some((role) => role.isAdmin);
	const canManageWidgets = user.permissions?.includes('config:widgetManagement:manage') || tenantRoles.some((role) => role.isAdmin);
	const canManageThemes = user.permissions?.includes('config:themeManagement') || tenantRoles.some((role) => role.isAdmin);

	if (!canManagePlugins && !canManageWidgets && !canManageThemes) {
		throw error(403, 'Insufficient permissions');
	}

	// --- Plugins Data ---
	// --- Plugins Data ---
	const tenantId = locals.tenantId || 'default-tenant';
	const allPlugins = pluginRegistry.getAll();

	const plugins = await Promise.all(
		allPlugins.map(async (p) => {
			let missingConfig = false;
			let configUrl = '/config/systemsetting';

			// Check persisted state
			const state = await pluginRegistry.getPluginState(p.metadata.id, tenantId);
			const enabled = state ? state.enabled : p.metadata.enabled;

			if (p.metadata.id === 'pagespeed') {
				missingConfig = !getPrivateSettingSync('GOOGLE_PAGESPEED_API_KEY');
			}

			return {
				name: p.metadata.id,
				displayName: p.metadata.name,
				version: p.metadata.version,
				description: p.metadata.description,
				author: p.metadata.author,
				icon: p.metadata.icon,
				enabled: enabled,
				missingConfig,
				configUrl
			};
		})
	);

	// --- Widgets Data ---
	// --- Widgets Data ---
	const installedWidgets: string[] = []; // Placeholder for real DB call
	const canInstallWidgets = user.permissions?.includes('config:widgetInstall:manage') || tenantRoles.some((role) => role.isAdmin);
	const canUninstallWidgets = user.permissions?.includes('config:widgetUninstall:manage') || tenantRoles.some((role) => role.isAdmin);
	const canManageMarketplace = user.permissions?.includes('config:marketplace:manage') || tenantRoles.some((role) => role.isAdmin);

	// --- Return Combined Data ---
	return {
		user: {
			_id: user._id.toString(),
			...user
		},
		permissions: {
			plugins: canManagePlugins,
			widgets: canManageWidgets,
			themes: canManageThemes
		},
		plugins,
		tenantId,
		installedWidgets,
		canInstallWidgets,
		canUninstallWidgets,
		canManageMarketplace
	};
};
