/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 * - `availableWidgets`: Dynamically discovered widgets from the widgets folder
 *
 * ### Usage
 * - Access user data from the server-side and pass it to the client-side component
 * - Dynamically load available widget components
 *
 * ### Features
 * - User authentication and authorization
 * - Proper typing for user data
 * - Dynamic widget discovery
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readdirSync } from 'fs';
import { join } from 'path';

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
		// Dynamically import the widget component to get its metadata
		// Using @vite-ignore to suppress Vite's dynamic import analysis warning
		const widgetModule = await import(/* @vite-ignore */ `./widgets/${componentName}.svelte`);

		if (widgetModule.widgetMeta) {
			return {
				componentName,
				name: widgetModule.widgetMeta.name,
				icon: widgetModule.widgetMeta.icon,
				description: widgetModule.widgetMeta.description
			};
		}

		logger.warn(`Widget ${componentName} has no widgetMeta export, using fallback`);
	} catch (error) {
		logger.error(`Failed to load metadata for widget ${componentName}:`, error);
	}

	// Fallback metadata generation
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
	} catch (error) {
		logger.error('Failed to discover widgets:', error);
		return [];
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		redirect(301, '/login');
	}

	logger.debug(`User authenticated successfully: \x1b[34m${user._id}\x1b[0m`);

	const { _id, ...rest } = user;

	// Discover available widgets
	const availableWidgets = await discoverWidgets();

	// Return user data with proper typing and available widgets
	return {
		user: {
			id: _id.toString(),
			...rest
		},
		availableWidgets
	};
};
