/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 * - `availableWidgets`: Dynamically discovered widgets from the widgets folder
 *
 * Features:
 * - User authentication and authorization
 * - Dynamic widget discovery from widgets folder
 * - Server-side UUID v4 generation for new widgets
 * - Support for dynamic width and height sizing
 */

import { redirect, json, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { readdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// System Logger
import { logger } from '@utils/logger.svelte';

interface WidgetInfo {
	componentName: string;
	name: string;
	icon: string;
	description?: string;
}

async function getWidgetMetadata(componentName: string): Promise<WidgetInfo> {
	try {
		const widgetModule = await import(`./widgets/${componentName}.svelte`);
		if (widgetModule.widgetMeta) {
			return {
				componentName,
				name: widgetModule.widgetMeta.name,
				icon: widgetModule.widgetMeta.icon,
				description: widgetModule.widgetMeta.description
			};
		}
		logger.warn(`Widget ${componentName} has no widgetMeta export, using fallback`);
	} catch (err) {
		logger.error(`Failed to load metadata for widget ${componentName}:`, err);
	}

	return {
		componentName,
		name: componentName
			.replace('Widget', '')
			.replace(/([A-Z])/g, ' $1')
			.trim(),
		icon: 'mdi:widgets',
		description: 'Custom dashboard widget'
	};
}

async function discoverWidgets(): Promise<WidgetInfo[]> {
	try {
		const widgetsPath = join(process.cwd(), 'src/routes/(app)/dashboard/widgets');
		const files = readdirSync(widgetsPath, { withFileTypes: true });

		const widgetPromises = files
			.filter((file) => file.isFile() && file.name.endsWith('Widget.svelte'))
			.map(async (file) => {
				const componentName = file.name.replace('.svelte', '');
				return await getWidgetMetadata(componentName);
			});

		const widgets = await Promise.all(widgetPromises);
		const sortedWidgets = widgets.sort((a, b) => a.name.localeCompare(b.name));

		logger.debug(`Discovered ${sortedWidgets.length} dashboard widgets`);
		return sortedWidgets;
	} catch (err) {
		logger.error('Failed to discover widgets:', err);
		return [];
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const { user, isAdmin, hasManageUsersPermission, permissions, roles } = locals;
	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(301, '/login');
	}

	// Ensure only admins can access the dashboard
	if (!isAdmin) {
		logger.warn(`Non-admin user (${user.email}) attempted to access the dashboard. Redirecting.`);
		throw redirect(302, '/'); // Redirect to home page or an access-denied page
	}

	logger.debug(`Admin user authenticated successfully: \x1b[34m${user._id}\x1b[0m`);

	const { _id, ...rest } = user;
	const availableWidgets = await discoverWidgets();

	return {
		pageData: {
			user: {
				id: _id.toString(),
				...rest
			},
			isAdmin,
			hasManageUsersPermission,
			permissions,
			roles
		},
		availableWidgets
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) {
			logger.warn('Unauthorized attempt to add widget');
			throw error(401, 'Unauthorized');
		}

		const data = await request.json();
		const { userId, component, label, icon, size } = data;

		if (userId !== user._id.toString()) {
			logger.warn(`User ID mismatch: ${userId} vs ${user._id}`);
			throw error(403, 'Forbidden');
		}

		if (!component || !label || !icon || !size || typeof size.w !== 'number' || typeof size.h !== 'number') {
			logger.error('Invalid widget data:', data);
			throw error(400, 'Invalid widget data');
		}

		const widget = {
			id: uuidv4(),
			component,
			label,
			icon,
			size,
			gridPosition: 0,
			movable: true,
			resizable: true
		};

		logger.debug(`Created widget ${widget.id} for user ${userId}`);
		return json(widget);
	}
};
