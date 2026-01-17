import 'clsx';
import { g as attr_class, a as attr, d as escape_html, c as stringify, b as attr_style, e as ensure_array_like } from '../../../../chunks/index5.js';
import '../../../../chunks/state.js';
import '../../../../chunks/logger.js';
import '../../../../chunks/store.svelte.js';
import { f as formatDisplayDate } from '../../../../chunks/dateUtils.js';
import { o as onDestroy } from '../../../../chunks/index-server.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
function SystemHealth($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const STATE_CONFIG = {
			READY: { color: 'text-success-500', icon: '✅', label: 'Ready' },
			DEGRADED: { color: 'text-warning-500', icon: '⚠️', label: 'Degraded' },
			INITIALIZING: { color: 'text-primary-500', icon: '🔄', label: 'Initializing' },
			FAILED: { color: 'text-error-500', icon: '❌', label: 'Failed' },
			IDLE: { color: 'text-surface-500', icon: '⏸️', label: 'Idle' }
		};
		const SERVICE_CONFIG = {
			healthy: {
				color: 'preset-filled-success-500',
				icon: '✓',
				label: 'Healthy'
			},
			unhealthy: {
				color: 'preset-filled-error-500',
				icon: '✗',
				label: 'Unhealthy'
			},
			initializing: {
				color: 'preset-filled-primary-500',
				icon: '⟳',
				label: 'Initializing'
			},
			unknown: {
				color: 'preset-filled-surface-500',
				icon: '?',
				label: 'Unknown'
			}
		};
		let currentState = 'IDLE';
		let services = {};
		let lastChecked = /* @__PURE__ */ new Date().toISOString();
		let autoRefresh = true;
		let isLoading = false;
		const uptime = /* @__PURE__ */ (() => {
			return 0;
		})();
		const serviceEntries = Object.entries(services);
		const serviceCount = serviceEntries.length;
		const healthyServices = serviceEntries.filter(([_, service]) => service.status === 'healthy').length;
		const unhealthyServices = serviceEntries.filter(([_, service]) => service.status === 'unhealthy').length;
		const formattedLastChecked = formatDisplayDate(lastChecked, 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		const apiHealthUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/system?action=health` : '/api/system?action=health';
		const healthPercentage = serviceCount > 0 ? Math.round((healthyServices / serviceCount) * 100) : 0;
		function getStateColor(state) {
			return STATE_CONFIG[state]?.color || STATE_CONFIG.IDLE.color;
		}
		function getStateIcon(state) {
			return STATE_CONFIG[state]?.icon;
		}
		function getStateLabel(state) {
			return STATE_CONFIG[state]?.label || 'Unknown';
		}
		function getServiceColor(status) {
			return SERVICE_CONFIG[status]?.color || SERVICE_CONFIG.unknown.color;
		}
		function getServiceIcon(status) {
			return SERVICE_CONFIG[status]?.icon || SERVICE_CONFIG.unknown.icon;
		}
		function getServiceLabel(status) {
			return SERVICE_CONFIG[status]?.label || 'Unknown';
		}
		function formatUptime(ms) {
			if (ms <= 0) return '0s';
			const seconds = Math.floor(ms / 1e3);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			if (days > 0) return `${days}d ${hours % 24}h`;
			if (hours > 0) return `${hours}h ${minutes % 60}m`;
			if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
			return `${seconds}s`;
		}
		function formatServiceName(name) {
			return (
				name.charAt(0).toUpperCase() +
				name
					.slice(1)
					.replace(/([A-Z])/g, ' $1')
					.trim()
			);
		}
		onDestroy(() => {});
		$$renderer2.push(
			`<div class="card space-y-4 p-4" role="region" aria-label="System health monitoring"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex items-center gap-3"><span${attr_class(`text-3xl ${stringify('transition-transform duration-300')}`)} role="img"${attr('aria-label', `System status: ${getStateLabel(currentState)}`)}>${escape_html(getStateIcon(currentState))}</span> <div><h3 class="h3 flex items-center gap-2">System Health `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></h3> <p class="text-sm opacity-70">Status: <span${attr_class(`font-bold ${getStateColor(currentState)}`)}>${escape_html(currentState)}</span></p></div></div> <div class="flex flex-wrap items-center gap-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox"${attr('checked', autoRefresh, true)} aria-label="Enable auto-refresh"/> Auto-refresh</label> <button class="preset-outlined-primary-500 btn-sm"${attr('disabled', isLoading, true)} title="Refresh now" aria-label="Refresh system health"><span${attr_class(`text-lg ${stringify('')}`)} role="img" aria-hidden="true">🔄</span></button> <button class="preset-outlined-warning-500 btn-sm"${attr('disabled', isLoading, true)} title="Reinitialize system" aria-label="Reinitialize system">`
		);
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span class="text-lg" role="img" aria-hidden="true">⚡</span>`);
		}
		$$renderer2.push(
			`<!--]--> Reinitialize</button></div></div> <div class="grid grid-cols-2 gap-3 sm:grid-cols-4"><div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Uptime</p> <p class="text-lg font-bold">${escape_html(formatUptime(uptime))}</p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Last Checked</p> <p class="text-sm font-bold">${escape_html(formattedLastChecked)}</p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Services</p> <p class="text-lg font-bold">${escape_html(serviceCount)} <span class="text-xs opacity-70">(${escape_html(healthyServices)}/${escape_html(serviceCount)})</span></p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Health</p> <p${attr_class(`text-lg font-bold ${stringify(healthPercentage >= 80 ? 'text-success-500' : healthPercentage >= 50 ? 'text-warning-500' : 'text-error-500')}`)}>${escape_html(healthPercentage)}%</p></div></div> `
		);
		if (serviceCount > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="h-2 w-full overflow-hidden rounded-full bg-surface-700" role="progressbar"${attr('aria-valuenow', healthPercentage)}${attr('aria-valuemin', 0)}${attr('aria-valuemax', 100)} aria-label="System health percentage"><div${attr_class(`h-full ${stringify(healthPercentage >= 80 ? 'bg-success-500' : healthPercentage >= 50 ? 'bg-warning-500' : 'bg-error-500')} transition-all duration-500`)}${attr_style(`width: ${stringify(healthPercentage)}%`)}></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="space-y-2"><div class="flex items-center justify-between"><h4 class="h4 text-sm font-semibold opacity-70">Service Status</h4> `
		);
		if (unhealthyServices > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<span class="badge preset-filled-error-500 text-xs">${escape_html(unhealthyServices)} unhealthy</span>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		if (serviceCount === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="card preset-outlined-surface-500p-6 text-center"><p class="text-sm opacity-70">No services registered</p></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"><!--[-->`);
			const each_array = ensure_array_like(serviceEntries);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let [name, service] = each_array[$$index];
				$$renderer2.push(
					`<div class="card flex items-start gap-3 p-3 transition-shadow duration-200 hover:shadow-lg" role="article"${attr('aria-label', `${formatServiceName(name)} service status`)}><div${attr_class(`badge ${getServiceColor(service.status)} flex h-8 w-8 shrink-0 items-center justify-center text-lg`)} role="img"${attr('aria-label', getServiceLabel(service.status))}>${escape_html(getServiceIcon(service.status))}</div> <div class="min-w-0 flex-1"><p class="text-sm font-semibold">${escape_html(formatServiceName(name))}</p> <p class="truncate text-xs opacity-70"${attr('title', service.message)}>${escape_html(service.message)}</p> `
				);
				if (service.error) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<p class="mt-1 truncate text-xs text-error-500"${attr('title', service.error)}>Error: ${escape_html(service.error)}</p>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (service.lastChecked) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<p class="mt-1 text-xs opacity-50">${escape_html(new Date(service.lastChecked).toLocaleTimeString())}</p>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div></div>`);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="card preset-outlined-surface-500p-3"><details class="space-y-2"><summary class="cursor-pointer text-sm font-semibold opacity-70 hover:opacity-100">API Health Endpoint</summary> <div class="space-y-2 text-xs opacity-70"><p>For external monitoring, use:</p> <div class="flex items-center gap-2"><code class="code flex-1 p-2">${escape_html(apiHealthUrl)}</code> <button type="button" class="btn-sm preset-outlined-primary-500" title="Copy to clipboard" aria-label="Copy endpoint URL to clipboard">`
		);
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`📋`);
		}
		$$renderer2.push(
			`<!--]--></button></div> <div class="mt-2 space-y-1"><p><strong>Returns:</strong> JSON with system status and component health</p> <p><strong>Status codes:</strong></p> <ul class="ml-4 list-disc space-y-0.5"><li>200 = READY/DEGRADED</li> <li>503 = INITIALIZING/FAILED/IDLE</li></ul></div></div></details></div></div>`
		);
	});
}
function _page($$renderer) {
	PageTitle($$renderer, {
		name: 'System Health',
		showBackButton: true,
		backUrl: '/config',
		icon: 'mdi:heart-pulse'
	});
	$$renderer.push(`<!----> <div class="wrapper p-4">`);
	SystemHealth($$renderer);
	$$renderer.push(`<!----></div>`);
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
