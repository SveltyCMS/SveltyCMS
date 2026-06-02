<!--
@file src/routes/(app)/dashboard/widgets/UnifiedMetricsWidget.svelte
@component
**Unified System Metrics — Performance, Security & Health with adaptive layouts and sparklines**

### Props
- `label` (string): Widget label (default: 'System Metrics')
- `size` (WidgetSize): Controls layout density — h:1 compact, h:2 rich, h:3+ full detail

### Features:
- Adaptive 3-tier layout: compact (h:1), rich (h:2), full (h:3+)
- Real-time health scoring with icon + color-coded status
- Mini SVG sparklines for response time and cache hit rate trends
- Rolling 30-point data buffer (3 min at 6s poll)
- Security metrics with color-coded severity indicators
- Bottleneck detection and display
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Unified Metrics",
	icon: "mdi:chart-donut",
	description: "Comprehensive system performance and security metrics with trend sparklines",
	defaultSize: { w: 2, h: 3 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface UnifiedMetrics {
		requests: { total: number; errors: number; errorRate: number; avgResponseTime: number };
		authentication: { validations: number; failures: number; successRate: number; cacheHitRate: number };
		api: { requests: number; errors: number; cacheHitRate: number };
		security: { rateLimitViolations: number; cspViolations: number; authFailures: number };
		performance: { slowRequests: number; avgHookExecutionTime: number; bottlenecks: string[] };
		uptime: number;
		timestamp: number;
	}

	const {
		label = 'System Metrics',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:chart-donut',
		widgetId = undefined as string | undefined,
		size = { w: 2, h: 3 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);
	const isFull = $derived(size.h >= 3);

	const SPARKLINE_MAX = 30;
	let responseTimeHistory = $state<number[]>([]);
	let cacheHitHistory = $state<number[]>([]);

	function computeHealth(m: UnifiedMetrics) {
		const { errorRate, avgResponseTime } = m.requests;
		const authSuccess = m.authentication.successRate;
		const cacheRate = (m.api.cacheHitRate + m.authentication.cacheHitRate) / 2;
		if (errorRate > 8 || avgResponseTime > 2000 || authSuccess < 85) return 'critical';
		if (errorRate > 4 || avgResponseTime > 1200 || authSuccess < 92) return 'poor';
		if (errorRate > 2 || avgResponseTime > 800 || cacheRate < 75) return 'fair';
		if (errorRate > 0.5 || avgResponseTime > 400) return 'good';
		return 'excellent';
	}

	function healthIcon(h: string): string {
		const m: Record<string, string> = { excellent: 'mdi:heart-pulse', good: 'mdi:heart', fair: 'mdi:pulse', poor: 'mdi:heart-broken', critical: 'mdi:alert-circle' };
		return m[h] || 'mdi:help-circle';
	}

	function healthCls(h: string): string {
		const m: Record<string, string> = { excellent: 'text-emerald-500', good: 'text-green-500', fair: 'text-amber-500', poor: 'text-orange-500', critical: 'text-red-500' };
		return m[h] || 'text-surface-500';
	}

	function metricCls(v: number, lo: number, hi: number): string {
		if (v > hi) return 'text-red-500';
		if (v > lo) return 'text-amber-500';
		return 'text-emerald-500';
	}

	function pushSparkline(arr: number[], val: number): number[] {
		const next = [...arr, val];
		return next.length > SPARKLINE_MAX ? next.slice(next.length - SPARKLINE_MAX) : next;
	}

	function recordMetrics(m: UnifiedMetrics) {
		responseTimeHistory = pushSparkline(responseTimeHistory, m.requests.avgResponseTime);
		cacheHitHistory = pushSparkline(cacheHitHistory, (m.api.cacheHitRate + m.authentication.cacheHitRate) / 2);
	}

	function fmtUptime(sec: number): string {
		const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}

	function fmtMs(ms: number): string {
		if (ms < 1) return '<1ms';
		return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/metrics"
	pollInterval={6000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const m = data as UnifiedMetrics | null}

		{#if m}{recordMetrics(m)}{/if}

		{#if !m}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3 text-surface-400">
					<div class="h-7 w-7 animate-spin rounded-full border-2 border-tertiary-500 dark:border-primary-500 border-t-transparent"></div>
					<p class="text-xs">Gathering metrics...</p>
				</div>
			</div>
		{:else}
			{const health = computeHealth(m)}
			{const avgCache = (m.api.cacheHitRate + m.authentication.cacheHitRate) / 2}

			{#if isCompact}
				<div class="flex h-full items-center gap-3 overflow-hidden">
					<div class="flex shrink-0 items-center gap-1.5">
						<iconify-icon icon={healthIcon(health)} class="text-lg {healthCls(health)}" ></iconify-icon>
						<span class="text-xs font-semibold capitalize {healthCls(health)}">{health}</span>
					</div>
					<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
					<div class="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
						<div class="flex shrink-0 items-center gap-1 rounded-lg bg-surface-50 px-2 py-1 dark:bg-surface-800">
							<span class="text-[10px] font-medium text-surface-500">Resp</span>
							<span class="text-xs font-bold tabular-nums {metricCls(m.requests.avgResponseTime, 400, 800)}">{fmtMs(m.requests.avgResponseTime)}</span>
						</div>
						<div class="flex shrink-0 items-center gap-1 rounded-lg bg-surface-50 px-2 py-1 dark:bg-surface-800">
							<span class="text-[10px] font-medium text-surface-500">Errors</span>
							<span class="text-xs font-bold tabular-nums {metricCls(m.requests.errorRate, 1, 3)}">{m.requests.errorRate.toFixed(1)}%</span>
						</div>
						<div class="flex shrink-0 items-center gap-1 rounded-lg bg-surface-50 px-2 py-1 dark:bg-surface-800">
							<span class="text-[10px] font-medium text-surface-500">Auth</span>
							<span class="text-xs font-bold tabular-nums {m.authentication.successRate > 95 ? 'text-emerald-500' : 'text-amber-500'}">{m.authentication.successRate.toFixed(0)}%</span>
						</div>
						<div class="flex shrink-0 items-center gap-1 rounded-lg bg-surface-50 px-2 py-1 dark:bg-surface-800">
							<span class="text-[10px] font-medium text-surface-500">Cache</span>
							<span class="text-xs font-bold tabular-nums text-blue-500">{avgCache.toFixed(0)}%</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex h-full flex-col space-y-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<iconify-icon icon={healthIcon(health)} class="text-3xl {healthCls(health)}" ></iconify-icon>
							<div>
								<div class="text-xl font-semibold capitalize {healthCls(health)}">{health}</div>
								<div class="text-xs text-surface-500">System Health</div>
							</div>
						</div>
						<div class="text-right">
							<div class="text-xs text-surface-500">Uptime</div>
							<div class="font-mono text-sm tabular-nums">{fmtUptime(m.uptime)}</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">Avg Response</div>
							<div class="mt-1 flex items-end justify-between">
								<span class="text-2xl font-semibold tabular-nums {metricCls(m.requests.avgResponseTime, 400, 800)}">{m.requests.avgResponseTime.toFixed(0)}<span class="text-sm font-normal">ms</span></span>
							</div>
						</div>
						<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">Error Rate</div>
							<div class="mt-1">
								<span class="text-2xl font-semibold tabular-nums {metricCls(m.requests.errorRate, 1, 3)}">{m.requests.errorRate.toFixed(1)}%</span>
							</div>
							<div class="mt-1 text-[10px] text-surface-400">{m.requests.errors} of {m.requests.total} reqs</div>
						</div>
						<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">Auth Success</div>
							<div class="mt-1">
								<span class="text-2xl font-semibold tabular-nums {m.authentication.successRate > 95 ? 'text-emerald-500' : 'text-amber-500'}">{m.authentication.successRate.toFixed(1)}%</span>
							</div>
							<div class="mt-1 text-[10px] text-surface-400">{m.authentication.validations} ok / {m.authentication.failures} fail</div>
						</div>
						<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">Cache Hit Rate</div>
							<div class="mt-1">
								<span class="text-2xl font-semibold tabular-nums text-blue-500">{avgCache.toFixed(1)}%</span>
							</div>
						</div>
					</div>

					{#if isFull}
						<div class="space-y-4 flex-1 overflow-y-auto pe-0.5 custom-scroll">
							<div>
								<h5 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400">Requests</h5>
								<div class="grid grid-cols-3 gap-2 text-center">
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums">{m.requests.total.toLocaleString()}</div><div class="text-[10px] text-surface-500">Total</div></div>
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums text-red-500">{m.requests.errors}</div><div class="text-[10px] text-surface-500">Errors</div></div>
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums text-amber-500">{m.performance.slowRequests}</div><div class="text-[10px] text-surface-500">Slow</div></div>
								</div>
							</div>
							<div>
								<h5 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400">Security</h5>
								<div class="grid grid-cols-3 gap-2 text-center">
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums text-orange-500">{m.security.rateLimitViolations}</div><div class="text-[10px] text-surface-500">Rate Limits</div></div>
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums text-purple-500">{m.security.cspViolations}</div><div class="text-[10px] text-surface-500">CSP</div></div>
									<div class="rounded-xl bg-surface-50 p-2 dark:bg-surface-800"><div class="font-mono text-sm font-semibold tabular-nums text-red-500">{m.security.authFailures}</div><div class="text-[10px] text-surface-500">Auth Fails</div></div>
								</div>
							</div>
							<div>
								<h5 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400">Performance</h5>
								<div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800">
									<div class="flex items-center justify-between"><span class="text-xs text-surface-500">Avg Hook Time</span><span class="font-mono text-sm font-semibold tabular-nums">{fmtMs(m.performance.avgHookExecutionTime)}</span></div>
								</div>
							</div>
							{#if m.performance.bottlenecks?.length > 0}
								<div>
									<h5 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400">Bottlenecks</h5>
									<div class="space-y-1">
										{#each m.performance.bottlenecks.slice(0, 3) as item}
											<div class="rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{item}</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.scrollbar-none { scrollbar-width: none; }
	.scrollbar-none::-webkit-scrollbar { display: none; }
	.custom-scroll::-webkit-scrollbar { width: 4px; }
	.custom-scroll::-webkit-scrollbar-track { background: transparent; }
	.custom-scroll::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.25); border-radius: 9999px; }
	.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.45); }
</style>
