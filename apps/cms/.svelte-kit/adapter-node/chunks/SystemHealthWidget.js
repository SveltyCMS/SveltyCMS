import { a as attr, g as attr_class, d as escape_html, b as attr_style, c as stringify, e as ensure_array_like } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
import './store.svelte.js';
import './logger.js';
const widgetMeta = {
	name: 'System Health',
	icon: 'mdi:heart-pulse',
	description: 'Monitor system services and overall health',
	defaultSize: { w: 2, h: 2 }
};
function SystemHealthWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'System Health',
			theme = 'light',
			icon = 'mdi:heart-pulse',
			widgetId = void 0,
			size = { w: 2, h: 2 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getStateColor(state) {
			switch (state) {
				case 'READY':
					return 'text-success-500';
				case 'DEGRADED':
					return 'text-warning-500';
				case 'INITIALIZING':
					return 'text-primary-500';
				case 'FAILED':
					return 'text-error-500';
				case 'IDLE':
					return 'text-surface-500';
				default:
					return 'text-surface-500';
			}
		}
		function getStateIcon(state) {
			switch (state) {
				case 'READY':
					return 'mdi:check-circle';
				case 'DEGRADED':
					return 'mdi:alert';
				case 'INITIALIZING':
					return 'mdi:loading';
				case 'FAILED':
					return 'mdi:close-circle';
				case 'IDLE':
					return 'mdi:pause-circle';
				default:
					return 'mdi:help-circle';
			}
		}
		function getServiceBadgeClass(status) {
			switch (status) {
				case 'healthy':
					return 'preset-filled-primary-500';
				case 'unhealthy':
					return 'preset-filled-error-500';
				case 'initializing':
					return 'variant-filled-warning';
				default:
					return 'preset-filled-surface-500';
			}
		}
		function formatUptime(ms) {
			const seconds = Math.floor(ms / 1e3);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			if (days > 0) return `${days}d ${hours % 24}h`;
			if (hours > 0) return `${hours}h ${minutes % 60}m`;
			if (minutes > 0) return `${minutes}m`;
			return `${seconds}s`;
		}
		function formatServiceName(name) {
			return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
		}
		{
			let children = function ($$renderer3, { data }) {
				if (data) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex h-full flex-col gap-3"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><iconify-icon${attr('icon', getStateIcon(data.overallStatus))}${attr_class(`text-2xl ${getStateColor(data.overallStatus)}`)} width="24"></iconify-icon> <div><span${attr_class(`font-bold ${getStateColor(data.overallStatus)}`)}>${escape_html(data.overallStatus)}</span> <p class="text-xs opacity-70">Uptime: ${escape_html(formatUptime(data.uptime))}</p></div></div> <button class="preset-outlined-warning-500 btn-sm" title="Reinitialize system"><iconify-icon icon="mdi:refresh" width="16"></iconify-icon></button></div> <div class="grid flex-1 grid-cols-2 gap-2 overflow-y-auto"${attr_style(`max-height: calc(${stringify(size.h)} * 120px - 80px);`)}><!--[-->`
					);
					const each_array = ensure_array_like(Object.entries(data.components));
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let [name, service] = each_array[$$index];
						$$renderer3.push(
							`<div class="card preset-outlined-surface-500flex flex-col gap-1 p-2"><div class="flex items-center justify-between"><span class="text-xs font-semibold">${escape_html(formatServiceName(name))}</span> <span${attr_class(`badge ${getServiceBadgeClass(service.status)}`)}>${escape_html(service.status)}</span></div> <p class="truncate text-xs opacity-70"${attr('title', service.message)}>${escape_html(service.message)}</p> `
						);
						if (service.error) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<p class="truncate text-xs text-error-500"${attr('title', service.error)}>${escape_html(service.error)}</p>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></div>`);
					}
					$$renderer3.push(`<!--]--></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400"><iconify-icon icon="mdi:alert-circle-outline" width="32" class="mb-2 text-surface-400"></iconify-icon> <span>Health data unavailable</span></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/health',
				pollInterval: 5e3,
				icon,
				widgetId,
				size,
				onSizeChange,
				onCloseRequest: onRemove,
				children
			});
		}
	});
}
export { SystemHealthWidget as default, widgetMeta };
//# sourceMappingURL=SystemHealthWidget.js.map
