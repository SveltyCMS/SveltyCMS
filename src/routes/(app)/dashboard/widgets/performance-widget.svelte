<!--
@file src/routes/(app)/dashboard/widgets/performance-widget.svelte
@component
**High-performance dashboard widget showing real-time application + system metrics with trend sparkline**
-->

<script lang="ts" module>
export const widgetMeta = {
	name: "Performance Monitor",
	icon: "mdi:chart-line",
	description: "Track system performance metrics",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface HealthMetrics {
		auth: { validations: number; failures: number };
		cache: { hits: number; misses: number };
		lastReset: number;
		requests: { total: number; errors: number };
		sessions: { active: number; rotations: number };
		system?: {
			memory: { used: number; total: number; external: number; rss: number };
			uptime: number;
			nodeVersion: string;
		};
	}

	const {
		label = 'Performance Monitor',
		theme = 'light',
		icon = 'mdi:chart-line',
		widgetId = undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	// In-memory local history for client-side sparkline
	let errorHistory = $state<number[]>([]);
	const HISTORY_MAX_POINTS = 15;

	function updateMetricsHistory(newData: any) {
		const metrics = newData as HealthMetrics | null;
		if (!metrics?.requests) return;
		
		const rate = metrics.requests.total > 0 
			? (metrics.requests.errors / metrics.requests.total) * 100 
			: 0;

		errorHistory.push(rate);
		if (errorHistory.length > HISTORY_MAX_POINTS) {
			errorHistory.shift();
		}
	}

	function getErrorColor(rate: number): string {
		if (rate > 5) return 'text-red-500';
		if (rate > 2) return 'text-amber-500';
		return 'text-emerald-500';
	}

	function formatUptime(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
		return `${Math.floor(seconds / 86400)}d`;
	}

	function formatMemory(mb: number): string {
		return mb < 1024 ? `${mb} MB` : `${(mb / 1024).toFixed(1)} GB`;
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/metrics?detailed=true"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	onDataLoaded={updateMetricsHistory}
>
	{#snippet children({ data })}
		{const metrics = data as HealthMetrics | null}

		{#if !metrics}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3 text-surface-500">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					<p class="text-sm">Loading performance metrics...</p>
				</div>
			</div>
		{:else}
			{const errorRate = metrics.requests?.total > 0 
				? (metrics.requests.errors / metrics.requests.total) * 100 
				: 0}
			{const cacheHitRate = (metrics.cache?.hits ?? 0) + (metrics.cache?.misses ?? 0) > 0 
				? (metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses)) * 100 
				: 0}
			{const authSuccessRate = metrics.auth?.validations > 0 
				? ((metrics.auth.validations - metrics.auth.failures) / metrics.auth.validations) * 100 
				: 100}

			{const points = errorHistory.map((val: number, i: number) => ({
				x: (i / Math.max(1, errorHistory.length - 1)) * 110,
				y: 24 - (Math.min(10, val) / 10) * 18 - 3 // Normalise 0-10% scale for visual precision
			}))}
			{const linePath = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}

			<div class="flex h-full flex-col space-y-4" role="region" aria-label="Performance stats">
				{#if size.h === 1}
					<!-- Compact single-row layout -->
					<div class="grid grid-cols-3 gap-2">
						<div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-2.5 shadow-xs text-center border border-transparent dark:border-gray-800">
							<div class="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Errors</div>
							<div class="text-xl font-bold tabular-nums {getErrorColor(errorRate)} mt-0.5">
								{errorRate.toFixed(1)}%
							</div>
						</div>
						<div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-2.5 shadow-xs text-center border border-transparent dark:border-gray-800">
							<div class="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Cache</div>
							<div class="text-xl font-bold tabular-nums text-blue-500 mt-0.5">
								{cacheHitRate.toFixed(1)}%
							</div>
						</div>
						<div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-2.5 shadow-xs text-center border border-transparent dark:border-gray-800">
							<div class="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Sessions</div>
							<div class="text-xl font-bold tabular-nums text-violet-500 mt-0.5">
								{metrics.sessions?.active ?? 0}
							</div>
						</div>
					</div>
				{:else}
					<!-- Key Health Indicators -->
					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-2xl bg-surface-100 p-4 dark:bg-surface-800 shadow-xs border border-transparent dark:border-gray-800 flex justify-between items-end">
							<div>
								<div class="text-xs font-semibold text-surface-500 mb-1">Error Rate</div>
								<div class="text-3xl font-bold tabular-nums {getErrorColor(errorRate)}">
									{errorRate.toFixed(1)}%
								</div>
								<div class="text-[10px] text-surface-400 dark:text-surface-500 mt-1">Last 10k requests</div>
							</div>
							
							{#if errorHistory.length > 1}
								<div class="w-[110px] h-[32px] overflow-visible pb-1 pr-1 shrink-0">
									<svg viewBox="0 0 110 24" class="w-full h-full overflow-visible">
										<path
											d={linePath}
											fill="none"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class={errorRate > 5 ? 'stroke-error-500' : errorRate > 2 ? 'stroke-warning-500' : 'stroke-success-500'}
										/>
									</svg>
								</div>
							{/if}
						</div>

						<div class="rounded-2xl bg-surface-100 p-4 dark:bg-surface-800 shadow-xs border border-transparent dark:border-gray-800">
							<div class="text-xs font-semibold text-surface-500 mb-1">Cache Hit Rate</div>
							<div class="text-3xl font-bold tabular-nums text-blue-500">
								{cacheHitRate.toFixed(1)}%
							</div>
							<div class="text-[10px] text-surface-400 dark:text-surface-500 mt-1">Efficiency</div>
						</div>

						<div class="rounded-2xl bg-surface-100 p-4 dark:bg-surface-800 shadow-xs border border-transparent dark:border-gray-800">
							<div class="text-xs font-semibold text-surface-500 mb-1">Auth Success</div>
							<div class="text-3xl font-bold tabular-nums text-emerald-500">
								{authSuccessRate.toFixed(1)}%
							</div>
							<div class="text-[10px] text-surface-400 dark:text-surface-500 mt-1">User auths</div>
						</div>

						<div class="rounded-2xl bg-surface-100 p-4 dark:bg-surface-800 shadow-xs border border-transparent dark:border-gray-800">
							<div class="text-xs font-semibold text-surface-500 mb-1">Active Sessions</div>
							<div class="text-3xl font-bold tabular-nums text-violet-500">
								{metrics.sessions?.active ?? 0}
							</div>
							<div class="text-[10px] text-surface-400 dark:text-surface-500 mt-1">Active logins</div>
						</div>
					</div>

					<!-- System & Request Details -->
					<div class="flex-1 grid grid-cols-1 gap-4 text-sm">
						<!-- Requests -->
						<div class="space-y-2">
							<h4 class="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1">Requests</h4>
							<div class="flex justify-between items-center bg-surface-100 dark:bg-surface-800 rounded-xl px-4 py-2.5 border border-transparent dark:border-gray-800">
								<span class="text-surface-600 dark:text-surface-400">Total</span>
								<span class="font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-100">{metrics.requests.total.toLocaleString()}</span>
							</div>
							<div class="flex justify-between items-center bg-surface-100 dark:bg-surface-800 rounded-xl px-4 py-2.5 border border-transparent dark:border-gray-800">
								<span class="text-surface-600 dark:text-surface-400">Errors</span>
								<span class="font-mono font-semibold tabular-nums text-red-500">{metrics.requests.errors}</span>
							</div>
						</div>

						<!-- System Info -->
						{#if metrics.system}
							<div class="space-y-2">
								<h4 class="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1">System</h4>
								<div class="rounded-xl bg-surface-100 dark:bg-surface-800 p-4 space-y-3 border border-transparent dark:border-gray-800">
									<div class="flex justify-between">
										<span class="text-surface-600 dark:text-surface-400">Memory Used</span>
										<span class="font-mono text-gray-900 dark:text-gray-100 tabular-nums">
											{formatMemory(metrics.system.memory.used)}
											<span class="text-xs text-surface-500">/ {formatMemory(metrics.system.memory.total)}</span>
										</span>
									</div>
									<div class="flex justify-between">
										<span class="text-surface-600 dark:text-surface-400">Uptime</span>
										<span class="font-mono text-gray-900 dark:text-gray-100 tabular-nums">{formatUptime(metrics.system.uptime)}</span>
									</div>
									{#if size.w >= 2}
										<div class="flex justify-between border-t border-gray-200 dark:border-gray-700/60 pt-2.5 mt-1">
											<span class="text-surface-600 dark:text-surface-400">Node</span>
											<span class="font-mono text-xs text-gray-700 dark:text-gray-300">{metrics.system.nodeVersion}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<!-- Last Reset timestamp row -->
					{#if metrics.lastReset}
						<div class="flex justify-between items-center text-[10px] text-surface-400 dark:text-surface-500 pt-2 border-t border-gray-150 dark:border-gray-850 px-1">
							<span>Metrics tracked since</span>
							<span class="font-mono font-medium">{new Date(metrics.lastReset).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	path {
		transition: d 0.5s ease-in-out, stroke 0.3s;
	}
</style>
