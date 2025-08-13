<!--
@file src/routes/(app)/dashboard/widgets/PerformanceWidget.svelte
@description Performance monitoring widget for dashboard using BaseWidget
Displays real-time system metrics integrated with the dashboard grid system
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Performance Monitor',
		icon: 'mdi:chart-line',
		description: 'Track system performance metrics',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import type { Snippet } from 'svelte';

	interface HealthMetrics {
		requests: { total: number; errors: number };
		auth: { validations: number; failures: number };
		cache: { hits: number; misses: number };
		sessions: { active: number; rotations: number };
		lastReset: number;
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
		size = { w: 1, h: 1 },
		onSizeChange = (newSize: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: { w: number; h: number };
		onSizeChange?: (newSize: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	// Performance indicator color based on metrics
	function getPerformanceColor(errorRate: number): string {
		if (errorRate > 5) return 'text-error-500';
		if (errorRate > 2) return 'text-warning-500';
		return 'text-success-500';
	}

	function formatUptime(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
		return `${Math.floor(seconds / 86400)}d`;
	}

	function formatMemory(mb: number): string {
		if (mb < 1024) return `${mb}MB`;
		return `${(mb / 1024).toFixed(1)}GB`;
	}

	// Widget content snippet (unused but kept for reference)
	const widgetContent: Snippet<[{ data: HealthMetrics | null }]> = (data) => {
		const metrics = data.data;

		if (!metrics) {
			return `<div class="flex h-full items-center justify-center text-surface-500">
				<div class="text-center">
					<iconify-icon icon="mdi:chart-line" width="48" class="mb-2 opacity-50"></iconify-icon>
					<p>Loading metrics...</p>
				</div>
			</div>`;
		}

		const errorRate = metrics.requests.total > 0 ? (metrics.requests.errors / metrics.requests.total) * 100 : 0;

		const authSuccessRate =
			metrics.auth.validations > 0 ? ((metrics.auth.validations - metrics.auth.failures) / metrics.auth.validations) * 100 : 100;

		const cacheHitRate = metrics.cache.hits + metrics.cache.misses > 0 ? (metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses)) * 100 : 0;

		return `<div class="flex h-full flex-col space-y-3 text-sm">
			<!-- Performance Overview -->
			<div class="grid grid-cols-2 gap-3">
				<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-surface-600 dark:text-surface-300">Error Rate</span>
						<span class="text-lg font-bold ${getPerformanceColor(errorRate)}">${errorRate.toFixed(2)}%</span>
					</div>
				</div>
			</div>
		</div>`;
	};
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
	{onCloseRequest}
>
	{#snippet children({ data })}
		{@const metrics = data as HealthMetrics | null}

		{#if !metrics}
			<div class="flex h-full items-center justify-center text-surface-500">
				<div class="text-center">
					<iconify-icon icon="mdi:chart-line" width="48" class="mb-2 opacity-50"></iconify-icon>
					<p>Loading metrics...</p>
				</div>
			</div>
		{:else}
			{@const errorRate = metrics.requests.total > 0 ? (metrics.requests.errors / metrics.requests.total) * 100 : 0}
			{@const authSuccessRate =
				metrics.auth.validations > 0 ? ((metrics.auth.validations - metrics.auth.failures) / metrics.auth.validations) * 100 : 100}
			{@const cacheHitRate =
				metrics.cache.hits + metrics.cache.misses > 0 ? (metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses)) * 100 : 0}
			{@const uptime = Math.floor((Date.now() - metrics.lastReset) / 1000)}

			<div class="flex h-full flex-col space-y-3 text-sm">
				<!-- Performance Overview -->
				<h3 class="text-center text-xs font-semibold">Performance Overview:</h3>

				<div class="grid grid-cols-2 gap-3">
					<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-surface-600 dark:text-surface-300">Error Rate</span>
							<span class="text-lg font-bold {getPerformanceColor(errorRate)}">{errorRate.toFixed(2)}%</span>
						</div>
					</div>

					<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-surface-600 dark:text-surface-300">Cache Hit</span>
							<span class="text-lg font-bold text-primary-500">{cacheHitRate.toFixed(1)}%</span>
						</div>
					</div>

					<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-surface-600 dark:text-surface-300">Auth Success</span>
							<span class="text-lg font-bold text-success-500">{authSuccessRate.toFixed(1)}%</span>
						</div>
					</div>

					<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-surface-600 dark:text-surface-300">Sessions</span>
							<span class="text-lg font-bold text-tertiary-500">{metrics.sessions.active}</span>
						</div>
					</div>
				</div>

				<!-- System Metrics (if available) -->
				{#if metrics.system}
					<div class="space-y-2">
						<h3 class="text-center text-xs font-semibold">System:</h3>

						<div class="grid grid-cols-2 gap-2 text-xs">
							<div class="flex justify-between">
								<span class="text-surface-600 dark:text-surface-400">Memory:</span>
								<span class="font-mono">{formatMemory(metrics.system.memory.used)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-surface-600 dark:text-surface-400">Uptime:</span>
								<span class="font-mono">{formatUptime(metrics.system.uptime)}</span>
							</div>
						</div>
					</div>
				{/if}

				<!-- Request Metrics -->
				<div class="space-y-2">
					<h3 class="text-center text-xs font-semibold">Requests:</h3>

					<div class="grid grid-cols-2 gap-2 text-xs">
						<div class="flex justify-between">
							<span class="text-surface-600 dark:text-surface-400">Total:</span>
							<span class="font-mono">{metrics.requests.total}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-600 dark:text-surface-400">Errors:</span>
							<span class="font-mono text-error-500">{metrics.requests.errors}</span>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
