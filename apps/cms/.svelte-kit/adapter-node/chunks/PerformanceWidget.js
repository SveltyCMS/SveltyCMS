import { g as attr_class, d as escape_html, c as stringify } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Performance Monitor',
	icon: 'mdi:chart-line',
	description: 'Track system performance metrics',
	defaultSize: { w: 1, h: 2 }
};
function PerformanceWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Performance Monitor',
			theme = 'light',
			icon = 'mdi:chart-line',
			widgetId = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getPerformanceColor(errorRate) {
			if (errorRate > 5) return 'text-error-500';
			if (errorRate > 2) return 'text-warning-500';
			return 'text-success-500';
		}
		function formatUptime(seconds) {
			if (seconds < 60) return `${seconds}s`;
			if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
			if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
			return `${Math.floor(seconds / 86400)}d`;
		}
		function formatMemory(mb) {
			if (mb < 1024) return `${mb}MB`;
			return `${(mb / 1024).toFixed(1)}GB`;
		}
		{
			let children = function ($$renderer3, { data }) {
				const metrics = data;
				if (!metrics) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex h-full items-center justify-center text-surface-500"><div class="text-center"><iconify-icon icon="mdi:chart-line" width="48" class="mb-2 opacity-50"></iconify-icon> <p>Loading metrics...</p></div></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
					const errorRate = metrics.requests.total > 0 ? (metrics.requests.errors / metrics.requests.total) * 100 : 0;
					const authSuccessRate =
						metrics.auth.validations > 0 ? ((metrics.auth.validations - metrics.auth.failures) / metrics.auth.validations) * 100 : 100;
					const cacheHitRate =
						metrics.cache.hits + metrics.cache.misses > 0 ? (metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses)) * 100 : 0;
					$$renderer3.push(
						`<div class="flex h-full flex-col space-y-3 text-sm"><h3 class="text-center text-xs font-semibold">Performance Overview:</h3> <div class="grid grid-cols-2 gap-3"><div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Error Rate</span> <span${attr_class(`text-lg font-bold ${stringify(getPerformanceColor(errorRate))}`)}>${escape_html(errorRate.toFixed(2))}%</span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Cache Hit</span> <span class="text-lg font-bold text-primary-500">${escape_html(cacheHitRate.toFixed(1))}%</span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Auth Success</span> <span class="text-lg font-bold text-success-500">${escape_html(authSuccessRate.toFixed(1))}%</span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Sessions</span> <span class="text-lg font-bold text-tertiary-500">${escape_html(metrics.sessions.active)}</span></div></div></div> `
					);
					if (metrics.system) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="space-y-2"><h3 class="text-center text-xs font-semibold">System:</h3> <div class="grid grid-cols-2 gap-2 text-xs"><div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Memory:</span> <span class="font-mono">${escape_html(formatMemory(metrics.system.memory.used))}</span></div> <div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Uptime:</span> <span class="font-mono">${escape_html(formatUptime(metrics.system.uptime))}</span></div></div></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <div class="space-y-2"><h3 class="text-center text-xs font-semibold">Requests:</h3> <div class="grid grid-cols-2 gap-2 text-xs"><div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Total:</span> <span class="font-mono">${escape_html(metrics.requests.total)}</span></div> <div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Errors:</span> <span class="font-mono text-error-500">${escape_html(metrics.requests.errors)}</span></div></div></div></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/metrics?detailed=true',
				pollInterval: 1e4,
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
export { PerformanceWidget as default, widgetMeta };
//# sourceMappingURL=PerformanceWidget.js.map
