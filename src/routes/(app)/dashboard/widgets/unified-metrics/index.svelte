<!--
@file src/routes/(app)/dashboard/widgets/unified-metrics/index.svelte
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
		name: 'Unified Metrics',
		icon: 'mdi:chart-donut',
		description: 'Comprehensive system performance and security metrics with trend sparklines',
		defaultSize: { w: 2, h: 3 }
	};
</script>

<script lang="ts">
	import { getClientLicenseStatus } from '@utils/client-license-cache';
	import type { LicenseStatus } from '@utils/license-manager';

	let licenseStatus = $state<LicenseStatus | null>(null);

	$effect(() => {
		getClientLicenseStatus('dashboard', 'unified-metrics').then((status) => {
			licenseStatus = status;
		});
	});

	const isLicensed = $derived(Boolean(licenseStatus?.hasLicense));

	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import {
		widget_unified_auth,
		widget_unified_auth_fails,
		widget_unified_auth_ratio,
		widget_unified_auth_success,
		widget_unified_avg_hook_time,
		widget_unified_avg_response,
		widget_unified_bottlenecks,
		widget_unified_cache,
		widget_unified_cache_hit_rate,
		widget_unified_csp,
		widget_unified_error_rate,
		widget_unified_errors,
		widget_unified_gathering,
		widget_unified_performance,
		widget_unified_premium_notice,
		widget_unified_rate_limits,
		widget_unified_reqs_ratio,
		widget_unified_requests,
		widget_unified_resp,
		widget_unified_security,
		widget_unified_slow,
		widget_unified_system_health,
		widget_unified_total,
		widget_unified_upgrade,
		widget_unified_uptime
	} from '@src/paraglide/messages';
	import { formatNumber } from '@utils/format-date';

	interface UnifiedMetrics {
		requests: { total: number; errors: number; errorRate: number; avgResponseTime: number };
		authentication: {
			validations: number;
			failures: number;
			successRate: number;
			cacheHitRate: number;
		};
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
		const m: Record<string, string> = {
			excellent: 'mdi:heart-pulse',
			good: 'mdi:heart',
			fair: 'mdi:pulse',
			poor: 'mdi:heart-broken',
			critical: 'mdi:alert-circle'
		};
		return m[h] || 'mdi:help-circle';
	}

	function healthCls(h: string): string {
		const m: Record<string, string> = {
			excellent: 'text-success-500',
			good: 'text-success-500',
			fair: 'text-warning-500',
			poor: 'text-warning-500',
			critical: 'text-error-500'
		};
		return m[h] || 'text-surface-500';
	}

	function metricCls(v: number, lo: number, hi: number): string {
		if (v > hi) return 'text-error-500';
		if (v > lo) return 'text-warning-500';
		return 'text-success-500';
	}

	function pushSparkline(arr: number[], val: number): number[] {
		const next = [...arr, val];
		return next.length > SPARKLINE_MAX ? next.slice(next.length - SPARKLINE_MAX) : next;
	}

	function recordMetrics(m: UnifiedMetrics) {
		responseTimeHistory = pushSparkline(responseTimeHistory, m.requests.avgResponseTime);
		cacheHitHistory = pushSparkline(
			cacheHitHistory,
			(m.api.cacheHitRate + m.authentication.cacheHitRate) / 2
		);
	}

	function fmtUptime(sec: number): string {
		const h = Math.floor(sec / 3600),
			m = Math.floor((sec % 3600) / 60);
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
					<div
						class="h-7 w-7 animate-spin rounded-full border-2 border-tertiary-500 dark:border-primary-500 border-t-transparent"
					></div>
					<p class="text-xs">{widget_unified_gathering()}</p>
				</div>
			</div>
		{:else}
			{const health = computeHealth(m)}
			{const avgCache = (m.api.cacheHitRate + m.authentication.cacheHitRate) / 2}

			{#if isCompact}
				<div class="flex h-full items-center gap-3 overflow-hidden">
					<div class="flex shrink-0 items-center gap-1.5">
						<iconify-icon icon={healthIcon(health)} class="text-lg {healthCls(health)}"
						></iconify-icon>
						<span class="text-xs font-semibold capitalize {healthCls(health)}">{health}</span>
					</div>
					<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
					<div class="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
						<div
							class="flex shrink-0 items-center gap-1 rounded bg-surface-500/10 px-2 py-1 dark:bg-surface-800"
						>
							<span class="text-[10px] font-medium text-surface-500">{widget_unified_resp()}</span>
							<span
								class="text-xs font-bold tabular-nums {metricCls(
									m.requests.avgResponseTime,
									400,
									800
								)}">{fmtMs(m.requests.avgResponseTime)}</span
							>
						</div>
						<div
							class="flex shrink-0 items-center gap-1 rounded bg-surface-500/10 px-2 py-1 dark:bg-surface-800"
						>
							<span class="text-[10px] font-medium text-surface-500">{widget_unified_errors()}</span
							>
							<span class="text-xs font-bold tabular-nums {metricCls(m.requests.errorRate, 1, 3)}"
								>{m.requests.errorRate.toFixed(1)}%</span
							>
						</div>
						<div
							class="flex shrink-0 items-center gap-1 rounded bg-surface-500/10 px-2 py-1 dark:bg-surface-800"
						>
							<span class="text-[10px] font-medium text-surface-500">{widget_unified_auth()}</span>
							<span
								class="text-xs font-bold tabular-nums {m.authentication.successRate > 95
									? 'text-success-500'
									: 'text-warning-500'}">{m.authentication.successRate.toFixed(0)}%</span
							>
						</div>
						<div
							class="flex shrink-0 items-center gap-1 rounded bg-surface-500/10 px-2 py-1 dark:bg-surface-800"
						>
							<span class="text-[10px] font-medium text-surface-500">{widget_unified_cache()}</span>
							<span class="text-xs font-bold tabular-nums text-tertiary-500"
								>{avgCache.toFixed(0)}%</span
							>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex h-full flex-col space-y-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<iconify-icon icon={healthIcon(health)} class="text-3xl {healthCls(health)}"
							></iconify-icon>
							<div>
								<div class="text-xl font-semibold capitalize {healthCls(health)}">{health}</div>
								<div class="text-xs text-surface-500">{widget_unified_system_health()}</div>
							</div>
						</div>
						<div class="text-end">
							<div class="text-xs text-surface-500">{widget_unified_uptime()}</div>
							<div class="font-mono text-sm tabular-nums">{fmtUptime(m.uptime)}</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-2xl bg-surface-500/10 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">{widget_unified_avg_response()}</div>
							<div class="mt-1 flex items-end justify-between">
								<span
									class="text-2xl font-semibold tabular-nums {metricCls(
										m.requests.avgResponseTime,
										400,
										800
									)}"
									>{m.requests.avgResponseTime.toFixed(0)}<span class="text-sm font-normal">ms</span
									></span
								>
							</div>
						</div>
						<div class="rounded-2xl bg-surface-500/10 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">{widget_unified_error_rate()}</div>
							<div class="mt-1">
								<span
									class="text-2xl font-semibold tabular-nums {metricCls(
										m.requests.errorRate,
										1,
										3
									)}">{m.requests.errorRate.toFixed(1)}%</span
								>
							</div>
							<div class="mt-1 text-[10px] text-surface-400">
								{widget_unified_reqs_ratio({ errors: m.requests.errors, total: m.requests.total })}
							</div>
						</div>
						<div class="rounded-2xl bg-surface-500/10 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">{widget_unified_auth_success()}</div>
							<div class="mt-1">
								<span
									class="text-2xl font-semibold tabular-nums {m.authentication.successRate > 95
										? 'text-success-500'
										: 'text-warning-500'}">{m.authentication.successRate.toFixed(1)}%</span
								>
							</div>
							<div class="mt-1 text-[10px] text-surface-400">
								{widget_unified_auth_ratio({
									ok: m.authentication.validations,
									fail: m.authentication.failures
								})}
							</div>
						</div>
						<div class="rounded-2xl bg-surface-500/10 p-3 dark:bg-surface-800">
							<div class="text-[11px] text-surface-500">{widget_unified_cache_hit_rate()}</div>
							<div class="mt-1">
								<span class="text-2xl font-semibold tabular-nums text-tertiary-500"
									>{avgCache.toFixed(1)}%</span
								>
							</div>
						</div>
					</div>

					{#if isLicensed && isFull}
						<div class="space-y-4 flex-1 overflow-y-auto pe-0.5 custom-scroll">
							<div>
								<h5
									class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400"
								>
									{widget_unified_requests()}
								</h5>
								<div class="grid grid-cols-3 gap-2 text-center">
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums">
											{formatNumber(m.requests.total)}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_total()}</div>
									</div>
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums text-error-500">
											{m.requests.errors}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_errors()}</div>
									</div>
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums text-warning-500">
											{m.performance.slowRequests}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_slow()}</div>
									</div>
								</div>
							</div>
							<div>
								<h5
									class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400"
								>
									{widget_unified_security()}
								</h5>
								<div class="grid grid-cols-3 gap-2 text-center">
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums text-warning-500">
											{m.security.rateLimitViolations}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_rate_limits()}</div>
									</div>
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums text-purple-500">
											{m.security.cspViolations}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_csp()}</div>
									</div>
									<div class="rounded bg-surface-500/10 p-2 dark:bg-surface-800">
										<div class="font-mono text-sm font-semibold tabular-nums text-error-500">
											{m.security.authFailures}
										</div>
										<div class="text-[10px] text-surface-500">{widget_unified_auth_fails()}</div>
									</div>
								</div>
							</div>
							<div>
								<h5
									class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400"
								>
									{widget_unified_performance()}
								</h5>
								<div class="rounded bg-surface-500/10 p-3 dark:bg-surface-800">
									<div class="flex items-center justify-between">
										<span class="text-xs text-surface-500">{widget_unified_avg_hook_time()}</span
										><span class="font-mono text-sm font-semibold tabular-nums"
											>{fmtMs(m.performance.avgHookExecutionTime)}</span
										>
									</div>
								</div>
							</div>
							{#if m.performance.bottlenecks?.length > 0}
								<div>
									<h5
										class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400"
									>
										{widget_unified_bottlenecks()}
									</h5>
									<div class="space-y-1">
										{#each m.performance.bottlenecks.slice(0, 3) as item (item)}
											<div
												class="rounded bg-warning-500/10 px-3 py-1.5 text-xs text-warning-600 dark:bg-warning-900/20 dark:text-warning-400"
											>
												{item}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{:else if isFull}
						<!-- Premium upgrade banner for full detail mode -->
						<div
							class="mt-2 rounded-lg bg-warning-500/10 dark:bg-warning-900/20 border border-warning-500/20 dark:border-warning-500/40 px-3 py-2 flex items-center justify-between"
						>
							<span class="text-xs text-warning-600 dark:text-warning-400">
								<iconify-icon icon="mdi:crown" class="inline me-1 text-warning-500"></iconify-icon>
								{widget_unified_premium_notice()}
							</span>
							<a
								href="https://marketplace.sveltycms.com"
								target="_blank"
								class="text-xs font-medium text-warning-600 dark:text-warning-400 hover:text-warning-600 underline shrink-0 ms-3"
								>{widget_unified_upgrade()}</a
							>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.scrollbar-none {
		scrollbar-width: none;
	}
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
	.custom-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scroll::-webkit-scrollbar-thumb {
		background: rgba(156, 163, 175, 0.25);
		border-radius: 9999px;
	}
	.custom-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(156, 163, 175, 0.45);
	}
</style>
