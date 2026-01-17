import { a as attr, g as attr_class, d as escape_html, c as stringify, e as ensure_array_like } from './index5.js';
import { o as onDestroy } from './index-server.js';
import './logger.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Unified Metrics',
	icon: 'mdi:chart-donut',
	description: 'Comprehensive system performance and security metrics',
	defaultSize: { w: 2, h: 3 }
};
function UnifiedMetricsWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'System Metrics',
			theme = 'light',
			icon = 'mdi:chart-donut',
			widgetId = void 0,
			size = { w: 2, h: 3 },
			showDetails = true,
			autoRefresh = true,
			refreshInterval = 3e3,
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		let metrics = {
			uptime: 0,
			requests: { total: 0, errors: 0, errorRate: 0, avgResponseTime: 0 },
			authentication: {
				validations: 0,
				failures: 0,
				successRate: 0,
				cacheHits: 0,
				cacheMisses: 0,
				cacheHitRate: 0
			},
			api: {
				requests: 0,
				errors: 0,
				cacheHits: 0,
				cacheMisses: 0,
				cacheHitRate: 0
			},
			security: { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 },
			performance: { slowRequests: 0, avgHookExecutionTime: 0, bottlenecks: [] }
		};
		const overallHealth = calculateOverallHealth(metrics);
		const healthColor = getHealthColor(overallHealth);
		const healthIcon = getHealthIcon(overallHealth);
		const primaryMetrics = getPrimaryMetrics(metrics);
		function calculateOverallHealth(m) {
			const factors = {
				errorRate: m.requests.errorRate,
				responseTime: m.requests.avgResponseTime,
				authSuccessRate: m.authentication.successRate,
				cacheHitRate: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2,
				securityViolations: m.security.rateLimitViolations + m.security.cspViolations,
				slowRequests: m.performance.slowRequests
			};
			if (factors.errorRate > 10 || factors.responseTime > 5e3 || factors.authSuccessRate < 80) {
				return 'critical';
			}
			if (factors.errorRate > 5 || factors.responseTime > 2e3 || factors.authSuccessRate < 90 || factors.securityViolations > 50) {
				return 'poor';
			}
			if (factors.errorRate > 2 || factors.responseTime > 1e3 || factors.cacheHitRate < 70 || factors.securityViolations > 20) {
				return 'fair';
			}
			if (factors.errorRate > 1 || factors.responseTime > 500 || factors.cacheHitRate < 85) {
				return 'good';
			}
			return 'excellent';
		}
		function getHealthColor(health) {
			switch (health) {
				case 'excellent':
					return 'text-green-600';
				case 'good':
					return 'text-green-500';
				case 'fair':
					return 'text-yellow-500';
				case 'poor':
					return 'text-orange-500';
				case 'critical':
					return 'text-red-600 animate-pulse';
				default:
					return 'text-gray-500';
			}
		}
		function getHealthIcon(health) {
			switch (health) {
				case 'excellent':
					return 'mdi:heart-pulse';
				case 'good':
					return 'mdi:heart';
				case 'fair':
					return 'mdi:heart-half';
				case 'poor':
					return 'mdi:heart-broken';
				case 'critical':
					return 'mdi:heart-off';
				default:
					return 'mdi:heart-outline';
			}
		}
		function getPrimaryMetrics(m) {
			return {
				responseTime: {
					value: m.requests.avgResponseTime,
					formatted: `${m.requests.avgResponseTime.toFixed(0)}ms`,
					status: m.requests.avgResponseTime < 500 ? 'good' : m.requests.avgResponseTime < 1e3 ? 'fair' : 'poor'
				},
				errorRate: {
					value: m.requests.errorRate,
					formatted: `${m.requests.errorRate.toFixed(2)}%`,
					status: m.requests.errorRate < 1 ? 'good' : m.requests.errorRate < 5 ? 'fair' : 'poor'
				},
				authSuccess: {
					value: m.authentication.successRate,
					formatted: `${m.authentication.successRate.toFixed(1)}%`,
					status: m.authentication.successRate > 95 ? 'good' : m.authentication.successRate > 90 ? 'fair' : 'poor'
				},
				cacheEfficiency: {
					value: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2,
					formatted: `${((m.authentication.cacheHitRate + m.api.cacheHitRate) / 2).toFixed(1)}%`,
					status: (m.authentication.cacheHitRate + m.api.cacheHitRate) / 2 > 80 ? 'good' : 'fair'
				}
			};
		}
		function getMetricColor(status) {
			switch (status) {
				case 'good':
					return 'text-green-600';
				case 'fair':
					return 'text-yellow-600';
				case 'poor':
					return 'text-red-600';
				default:
					return 'text-gray-600';
			}
		}
		function formatUptime(ms) {
			const seconds = Math.floor(ms / 1e3);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			if (days > 0) return `${days}d ${hours % 24}h`;
			if (hours > 0) return `${hours}h ${minutes % 60}m`;
			if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
			return `${seconds}s`;
		}
		function formatNumber(num) {
			if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
			if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
			return num.toString();
		}
		function formatLastUpdate() {
			return 'Never';
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
					`<div class="flex h-full flex-col space-y-3 p-2"><div class="flex items-center justify-between"><div class="flex items-center space-x-2"><iconify-icon${attr('icon', healthIcon)}${attr_class(`text-xl ${stringify(healthColor)}`)}></iconify-icon> <div><h3 class="font-semibold capitalize">${escape_html(overallHealth)}</h3> <p class="text-xs text-gray-500">System Health</p></div></div> <div class="text-right"><div class="text-xs text-gray-500">Uptime</div> <div class="font-mono text-sm">${escape_html(formatUptime(metrics.uptime))}</div></div></div> <div class="grid grid-cols-2 gap-2"><div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Response Time</div> <div${attr_class(`font-bold ${stringify(getMetricColor(primaryMetrics.responseTime.status))}`)}>${escape_html(primaryMetrics.responseTime.formatted)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Error Rate</div> <div${attr_class(`font-bold ${stringify(getMetricColor(primaryMetrics.errorRate.status))}`)}>${escape_html(primaryMetrics.errorRate.formatted)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Auth Success</div> <div${attr_class(`font-bold ${stringify(getMetricColor(primaryMetrics.authSuccess.status))}`)}>${escape_html(primaryMetrics.authSuccess.formatted)}</div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Cache Hit</div> <div${attr_class(`font-bold ${stringify(getMetricColor(primaryMetrics.cacheEfficiency.status))}`)}>${escape_html(primaryMetrics.cacheEfficiency.formatted)}</div></div></div> `
				);
				if (showDetails && size.h >= 3) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="min-h-0 flex-1 space-y-2"><div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Request Statistics</h5> <div class="grid grid-cols-3 gap-1 text-xs"><div class="text-center"><div class="font-mono">${escape_html(formatNumber(metrics.requests.total))}</div> <div class="text-gray-500">Total</div></div> <div class="text-center"><div class="font-mono text-red-600">${escape_html(formatNumber(metrics.requests.errors))}</div> <div class="text-gray-500">Errors</div></div> <div class="text-center"><div class="font-mono text-yellow-600">${escape_html(formatNumber(metrics.performance.slowRequests))}</div> <div class="text-gray-500">Slow</div></div></div></div> <div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Security Events</h5> <div class="grid grid-cols-3 gap-1 text-xs"><div class="text-center"><div class="font-mono text-orange-600">${escape_html(metrics.security.rateLimitViolations)}</div> <div class="text-gray-500">Rate Limits</div></div> <div class="text-center"><div class="font-mono text-purple-600">${escape_html(metrics.security.cspViolations)}</div> <div class="text-gray-500">CSP Violations</div></div> <div class="text-center"><div class="font-mono text-red-600">${escape_html(metrics.security.authFailures)}</div> <div class="text-gray-500">Auth Fails</div></div></div></div> `
					);
					if (metrics.performance.bottlenecks.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Performance Bottlenecks</h5> <div class="space-y-1"><!--[-->`
						);
						const each_array = ensure_array_like(metrics.performance.bottlenecks.slice(0, 3));
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let bottleneck = each_array[$$index];
							$$renderer3.push(`<div class="rounded bg-yellow-100 px-1 py-0.5 text-xs dark:bg-yellow-900/20">${escape_html(bottleneck)}</div>`);
						}
						$$renderer3.push(`<!--]--></div></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--> <div class="border-t pt-1 text-center text-xs text-gray-500">Last updated: ${escape_html(formatLastUpdate())}</div></div>`
				);
			}
		});
	});
}
export { UnifiedMetricsWidget as default, widgetMeta };
//# sourceMappingURL=UnifiedMetricsWidget.js.map
