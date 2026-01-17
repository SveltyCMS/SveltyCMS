import { a as attr, g as attr_class, d as escape_html, c as stringify, e as ensure_array_like } from './index5.js';
import { o as onDestroy } from './index-server.js';
import './logger.js';
import { B as BaseWidget } from './BaseWidget.js';
import './store.svelte.js';
const widgetMeta = {
	name: 'Security Monitor',
	icon: 'mdi:shield-alert',
	description: 'Advanced security threat monitoring and incident response',
	defaultSize: { w: 3, h: 3 }
};
function SecurityWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Security Monitor',
			theme = 'light',
			icon = 'mdi:shield-alert',
			widgetId = void 0,
			size = { w: 3, h: 3 },
			autoRefresh = true,
			refreshInterval = 5e3,
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		let securityStats = {
			activeIncidents: 0,
			blockedIPs: 0,
			throttledIPs: 0,
			threatLevelDistribution: { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
			cspViolations: 0,
			rateLimitHits: 0
		};
		let incidents = [];
		let isLoading = true;
		const overallThreatLevel = calculateOverallThreatLevel(securityStats);
		const threatColor = getThreatColor(overallThreatLevel);
		const statusIcon = getThreatIcon(overallThreatLevel);
		function calculateOverallThreatLevel(stats) {
			const { threatLevelDistribution, activeIncidents } = stats;
			if (threatLevelDistribution.critical > 0 || activeIncidents > 10) return 'critical';
			if (threatLevelDistribution.high > 0 || activeIncidents > 5) return 'high';
			if (threatLevelDistribution.medium > 0 || activeIncidents > 2) return 'medium';
			if (threatLevelDistribution.low > 0 || activeIncidents > 0) return 'low';
			return 'safe';
		}
		function getThreatColor(level) {
			switch (level) {
				case 'safe':
					return 'text-green-500';
				case 'low':
					return 'text-yellow-500';
				case 'medium':
					return 'text-orange-500';
				case 'high':
					return 'text-red-500';
				case 'critical':
					return 'text-red-700 animate-pulse';
				default:
					return 'text-gray-500';
			}
		}
		function getThreatIcon(level) {
			switch (level) {
				case 'safe':
					return 'mdi:shield-check';
				case 'low':
					return 'mdi:shield-alert-outline';
				case 'medium':
					return 'mdi:shield-alert';
				case 'high':
					return 'mdi:shield-remove';
				case 'critical':
					return 'mdi:shield-off';
				default:
					return 'mdi:shield-outline';
			}
		}
		function formatTimestamp(timestamp) {
			return new Date(timestamp).toLocaleString();
		}
		function getIncidentPriorityClass(threatLevel) {
			switch (threatLevel) {
				case 'critical':
					return 'border-l-4 border-red-600 bg-red-50 dark:bg-red-900/20';
				case 'high':
					return 'border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/20';
				case 'medium':
					return 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
				case 'low':
					return 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20';
				default:
					return 'border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-800';
			}
		}
		onDestroy(() => {});
		BaseWidget($$renderer2, {
			label,
			theme,
			icon,
			widgetId,
			size,
			onSizeChange,
			onCloseRequest: onRemove,
			children: ($$renderer3) => {
				$$renderer3.push(
					`<div class="flex h-full flex-col space-y-4 p-2"><div class="flex items-center justify-between"><div class="flex items-center space-x-3"><iconify-icon${attr('icon', statusIcon)}${attr_class(`text-2xl ${stringify(threatColor)}`)}></iconify-icon> <div><h3 class="text-lg font-semibold capitalize">${escape_html(overallThreatLevel)} Status</h3> <p class="text-sm text-gray-600 dark:text-gray-400">${escape_html(securityStats.activeIncidents)} active incidents</p></div></div> <button class="preset-outlined-surface-500btn btn-sm"${attr('disabled', isLoading, true)} aria-label="Refresh security data"><iconify-icon icon="mdi:refresh" class="text-sm"></iconify-icon></button></div> <div class="grid grid-cols-2 gap-2 text-sm"><div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-red-600">Blocked IPs</div> <div class="text-xl font-bold">${escape_html(securityStats.blockedIPs)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-orange-600">Throttled IPs</div> <div class="text-xl font-bold">${escape_html(securityStats.throttledIPs)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-purple-600">CSP Violations</div> <div class="text-xl font-bold">${escape_html(securityStats.cspViolations)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-blue-600">Rate Limits</div> <div class="text-xl font-bold">${escape_html(securityStats.rateLimitHits)}</div></div></div> `
				);
				if (incidents.length > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="min-h-0 flex-1"><h4 class="mb-2 flex items-center font-medium"><iconify-icon icon="mdi:alert-circle" class="mr-2 text-orange-500"></iconify-icon> Active Incidents (${escape_html(incidents.length)})</h4> <div class="max-h-32 space-y-1 overflow-y-auto"><!--[-->`
					);
					const each_array = ensure_array_like(incidents);
					for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
						let incident = each_array[$$index_1];
						$$renderer3.push(
							`<div${attr_class(`rounded p-2 text-xs ${stringify(getIncidentPriorityClass(incident.threatLevel))}`)}><div class="flex items-start justify-between"><div class="flex-1"><div class="font-medium">${escape_html(incident.clientIp)} <span class="ml-1 rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">${escape_html(incident.threatLevel)}</span></div> <div class="text-gray-600 dark:text-gray-400">${escape_html(incident.indicatorCount)} indicators • ${escape_html(formatTimestamp(incident.timestamp))}</div> `
						);
						if (incident.responseActions.length > 0) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<div class="mt-1"><!--[-->`);
							const each_array_1 = ensure_array_like(incident.responseActions);
							for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
								let action = each_array_1[$$index];
								$$renderer3.push(
									`<span class="mr-1 inline-block rounded bg-gray-300 px-1 py-0.5 text-xs dark:bg-gray-600">${escape_html(action)}</span>`
								);
							}
							$$renderer3.push(`<!--]--></div>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(
							`<!--]--></div> <div class="flex space-x-1"><button class="btn-xs preset-outlined-surface-500btn" title="Resolve incident"><iconify-icon icon="mdi:check" class="text-xs"></iconify-icon></button> `
						);
						if (incident.responseActions.includes('block') || incident.responseActions.includes('blacklist')) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(
								`<button class="btn-xs preset-outlined-surface-500btn" title="Unblock IP"><iconify-icon icon="mdi:lock-open" class="text-xs"></iconify-icon></button>`
							);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></div></div></div>`);
					}
					$$renderer3.push(`<!--]--></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 items-center justify-center text-gray-500"><div class="text-center"><iconify-icon icon="mdi:shield-check" class="mb-2 text-4xl text-green-500"></iconify-icon> <p class="text-sm">No active security incidents</p></div></div>`
					);
				}
				$$renderer3.push(`<!--]--> `);
				if (size.h >= 3) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Threat Distribution</h5> <div class="flex space-x-1 text-xs"><div class="flex-1 text-center"><div class="font-bold text-red-600">${escape_html(securityStats.threatLevelDistribution.critical)}</div> <div class="text-gray-500">Critical</div></div> <div class="flex-1 text-center"><div class="font-bold text-orange-600">${escape_html(securityStats.threatLevelDistribution.high)}</div> <div class="text-gray-500">High</div></div> <div class="flex-1 text-center"><div class="font-bold text-yellow-600">${escape_html(securityStats.threatLevelDistribution.medium)}</div> <div class="text-gray-500">Medium</div></div> <div class="flex-1 text-center"><div class="font-bold text-blue-600">${escape_html(securityStats.threatLevelDistribution.low)}</div> <div class="text-gray-500">Low</div></div></div></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div>`);
			}
		});
	});
}
export { SecurityWidget as default, widgetMeta };
//# sourceMappingURL=SecurityWidget.js.map
