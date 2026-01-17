import { redirect, error, json } from '@sveltejs/kit';
import { readdirSync } from 'fs';
import { join } from 'path';
import { v4 } from 'uuid';
import { l as logger } from '../../../chunks/logger.server.js';
const __variableDynamicImportRuntimeHelper = (glob$1, path$13, segs) => {
	const v = glob$1[path$13];
	if (v) return typeof v === 'function' ? v() : Promise.resolve(v);
	return new Promise((_, reject) => {
		(typeof queueMicrotask === 'function' ? queueMicrotask : setTimeout)(
			reject.bind(
				null,
				/* @__PURE__ */ new Error(
					'Unknown variable dynamic import: ' +
						path$13 +
						(path$13.split('/').length !== segs ? '. Note that variables only represent file names one level deep.' : '')
				)
			)
		);
	});
};
let cachedWidgets = null;
const WIDGET_CACHE_TTL = 1e3 * 60 * 5;
let lastCacheTime = 0;
async function getWidgetMetadata(componentName) {
	try {
		const widgetModule = await __variableDynamicImportRuntimeHelper(
			/* @__PURE__ */ Object.assign({
				'../../../../../shared/features/src/dashboard/widgets/CPUWidget.svelte': () => import('../../../chunks/CPUWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/CacheMonitorWidget.svelte': () => import('../../../chunks/CacheMonitorWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/DatabasePoolDiagnostics.svelte': () =>
					import('../../../chunks/DatabasePoolDiagnostics.js'),
				'../../../../../shared/features/src/dashboard/widgets/DiskWidget.svelte': () => import('../../../chunks/DiskWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/Last5ContentWidget.svelte': () => import('../../../chunks/Last5ContentWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/Last5MediaWidget.svelte': () => import('../../../chunks/Last5MediaWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/LogsWidget.svelte': () => import('../../../chunks/LogsWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/MemoryWidget.svelte': () => import('../../../chunks/MemoryWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/PerformanceWidget.svelte': () => import('../../../chunks/PerformanceWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/SecurityWidget.svelte': () => import('../../../chunks/SecurityWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/SystemHealthWidget.svelte': () => import('../../../chunks/SystemHealthWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/SystemMessagesWidget.svelte': () => import('../../../chunks/SystemMessagesWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/UnifiedMetricsWidget.svelte': () => import('../../../chunks/UnifiedMetricsWidget.js'),
				'../../../../../shared/features/src/dashboard/widgets/UserOnlineWidget.svelte': () => import('../../../chunks/UserOnlineWidget.js')
			}),
			`../../../../../shared/features/src/dashboard/widgets/${componentName}.svelte`,
			11
		);
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
async function discoverWidgets() {
	if (cachedWidgets && Date.now() - lastCacheTime < WIDGET_CACHE_TTL && process.env.NODE_ENV === 'production') {
		return cachedWidgets;
	}
	try {
		const widgetsPath = join(process.cwd(), 'shared/features/src/dashboard/widgets');
		const files = readdirSync(widgetsPath, { withFileTypes: true });
		const widgetPromises = files
			.filter((file) => file.isFile() && file.name.endsWith('Widget.svelte'))
			.map(async (file) => {
				const componentName = file.name.replace('.svelte', '');
				return await getWidgetMetadata(componentName);
			});
		const widgets = await Promise.all(widgetPromises);
		const sortedWidgets = widgets.sort((a, b) => a.name.localeCompare(b.name));
		logger.trace(`Discovered ${sortedWidgets.length} dashboard widgets`);
		cachedWidgets = sortedWidgets;
		lastCacheTime = Date.now();
		return sortedWidgets;
	} catch (err) {
		logger.error('Failed to discover widgets:', err);
		return [];
	}
}
const load = async ({ locals }) => {
	const { user, isAdmin, roles: tenantRoles } = locals;
	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(301, '/login');
	}
	const hasDashboardPermission =
		isAdmin ||
		tenantRoles.some((role) =>
			role.permissions?.some((p) => {
				const [resource, action] = p.split(':');
				return resource === 'dashboard' && action === 'read';
			})
		);
	if (!hasDashboardPermission) {
		logger.warn(`User ${user._id} (${user.email}) does not have permission to access dashboard. Redirecting.`);
		throw error(403, 'Insufficient permissions to access dashboard');
	}
	logger.trace(`User authenticated successfully for dashboard: ${user._id}`);
	const { _id, ...rest } = user;
	const availableWidgets = await discoverWidgets();
	return {
		pageData: {
			user: {
				id: _id.toString(),
				...rest
			},
			isAdmin
		},
		availableWidgets
	};
};
const actions = {
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
			id: v4(),
			component,
			label,
			icon,
			size,
			gridPosition: 0,
			movable: true,
			resizable: true
		};
		logger.trace(`Created widget ${widget.id} for user ${userId}`);
		return json(widget);
	}
};
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map
