import 'clsx';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import '../../../../chunks/logger.js';
import '../../../../chunks/widgetStore.svelte.js';
function WidgetDashboard($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		let widgets = [];
		let activeFilter = 'all';
		data?.user?.tenantId || data?.tenantId || 'default-tenant';
		const userRole = data?.user?.role || 'user';
		const userPermissions = data?.user?.permissions || [];
		userRole === 'admin' || userRole === 'super-admin' || userPermissions.includes('manage_widgets') || userPermissions.includes('widget_management');
		({
			core: widgets.filter((w) => w.isCore).length,
			custom: widgets.filter((w) => !w.isCore).length,
			active: widgets.filter((w) => w.isActive).length,
			inactive: widgets.filter((w) => !w.isActive).length,
			withInput: widgets.filter((w) => w.pillar?.input?.exists).length,
			withDisplay: widgets.filter((w) => w.pillar?.display?.exists).length
		});
		widgets.filter((widget) => {
			let matchesFilter = false;
			switch (activeFilter) {
				case 'all':
					matchesFilter = true;
					break;
				case 'core':
					matchesFilter = widget.isCore;
					break;
				case 'custom':
					matchesFilter = !widget.isCore;
					break;
				case 'active':
					matchesFilter = widget.isActive;
					break;
				case 'inactive':
					matchesFilter = !widget.isActive;
					break;
			}
			return matchesFilter;
		});
		$$renderer2.push(`<div class="wrapper h-full max-h-screen space-y-6 overflow-y-auto p-4 pb-16">`);
		{
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center justify-center p-8"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div> <span class="ml-3 text-lg">Loading widgets...</span></div>`
			);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="totalTooltip"><p class="text-sm">All registered widgets in the system (core + custom)</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="activeTooltip"><p class="text-sm">Widgets currently enabled and available for use in collections</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="coreTooltip"><p class="text-sm">Essential system widgets that are always active and cannot be disabled</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="customTooltip"><p class="text-sm">Optional widgets that can be toggled on/off as needed</p> <div class="preset-filled arrow"></div></div>`
		);
	});
}
function _page($$renderer, $$props) {
	const { data } = $$props;
	PageTitle($$renderer, {
		name: 'Widget Management',
		icon: 'mdi:widgets',
		showBackButton: true,
		backUrl: '/config'
	});
	$$renderer.push(`<!----> `);
	WidgetDashboard($$renderer, { data });
	$$renderer.push(`<!---->`);
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
