import { d as escape_html, g as attr_class, b as attr_style, c as stringify, e as ensure_array_like } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Database Pool',
	icon: 'mdi:database-cog',
	description: 'Monitor database connection pool health and diagnostics',
	defaultSize: { w: 2, h: 3 },
	category: 'monitoring'
};
function DatabasePoolDiagnostics($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Connection Pool',
			theme = 'light',
			icon = 'mdi:database-cog',
			widgetId = void 0,
			size = { w: 2, h: 3 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getHealthColor(health) {
			switch (health) {
				case 'healthy':
					return 'text-success-600 bg-success-50';
				case 'degraded':
					return 'text-warning-600 bg-warning-50';
				case 'critical':
					return 'text-error-600 bg-error-50';
				default:
					return 'text-gray-600 bg-gray-50';
			}
		}
		function getUtilizationColor(utilization) {
			if (utilization >= 90) return 'text-error-600';
			if (utilization >= 75) return 'text-warning-600';
			return 'text-success-600';
		}
		function getUtilizationBarColor(utilization) {
			if (utilization >= 90) return 'bg-error-600';
			if (utilization >= 75) return 'bg-warning-500';
			return 'bg-success-500';
		}
		function getRecommendationIconColor(recommendation) {
			if (recommendation.includes('healthy')) return 'text-success-600';
			if (recommendation.includes('Consider') || recommendation.includes('increase') || recommendation.includes('reduce')) return 'text-warning-600';
			return 'text-info-600';
		}
		{
			let children = function ($$renderer3, { data: diagnostics, isLoading, error }) {
				if (isLoading && !diagnostics) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex items-center justify-center py-8"><div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
					if (error) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-900/20"><p class="text-sm text-error-800 dark:text-error-200">${escape_html(error)}</p></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						if (diagnostics) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(
								`<div class="mb-4"><span${attr_class(`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${stringify(getHealthColor(diagnostics.healthStatus))}`)}><span class="mr-2 h-2 w-2 rounded-full bg-current"></span> ${escape_html(diagnostics.healthStatus.charAt(0).toUpperCase() + diagnostics.healthStatus.slice(1))}</span></div> <div class="mb-6 grid grid-cols-2 gap-4"><div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Total</div> <div class="text-2xl font-bold text-surface-900 dark:text-white">${escape_html(diagnostics.totalConnections)}</div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Active</div> <div class="text-2xl font-bold text-surface-900 dark:text-white">${escape_html(diagnostics.activeConnections)}</div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Idle</div> <div class="text-2xl font-bold text-surface-900 dark:text-white">${escape_html(diagnostics.idleConnections)}</div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Waiting</div> <div${attr_class(`text-2xl font-bold ${stringify(diagnostics.waitingRequests > 0 ? 'text-warning-600' : 'text-surface-900 dark:text-white')}`)}>${escape_html(diagnostics.waitingRequests)}</div></div></div> <div class="mb-6"><div class="mb-2 flex items-center justify-between"><span class="text-sm font-medium text-surface-700 dark:text-surface-300">Pool Utilization</span> <span${attr_class(`text-sm font-semibold ${stringify(getUtilizationColor(diagnostics.poolUtilization))}`)}>${escape_html(diagnostics.poolUtilization.toFixed(1))}%</span></div> <div class="h-3 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div${attr_class(`h-full rounded-full transition-all duration-500 ${stringify(getUtilizationBarColor(diagnostics.poolUtilization))}`)}${attr_style(`width: ${stringify(Math.min(diagnostics.poolUtilization, 100))}%`)}></div></div></div> `
							);
							if (diagnostics.recommendations && diagnostics.recommendations.length > 0) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(
									`<div class="border-t border-surface-200 pt-4 dark:text-surface-50"><h4 class="mb-2 text-sm font-semibold text-surface-700 dark:text-surface-300">Recommendations</h4> <ul class="space-y-2"><!--[-->`
								);
								const each_array = ensure_array_like(diagnostics.recommendations);
								for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
									let recommendation = each_array[$$index];
									$$renderer3.push(
										`<li class="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-50"><svg${attr_class(`mt-0.5 h-4 w-4 shrink-0 ${stringify(getRecommendationIconColor(recommendation))}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <span>${escape_html(recommendation)}</span></li>`
									);
								}
								$$renderer3.push(`<!--]--></ul></div>`);
							} else {
								$$renderer3.push('<!--[!-->');
							}
							$$renderer3.push(`<!--]-->`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(`<!--]-->`);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				icon,
				size,
				onSizeChange,
				endpoint: '/api/database/pool-diagnostics',
				pollInterval: 3e4,
				widgetId,
				onCloseRequest: onRemove,
				children
			});
		}
	});
}
export { DatabasePoolDiagnostics as default, widgetMeta };
//# sourceMappingURL=DatabasePoolDiagnostics.js.map
