<script lang="ts" module>
	export const widgetMeta = {
		name: 'Database Pool',
		icon: 'mdi:database-cog',
		description: 'Monitor database connection pool health and diagnostics',
		defaultSize: { w: 2, h: 3 },
		category: 'monitoring'
	};
</script>

<script lang="ts">
	/**
	 * @file Database Pool Diagnostics Widget
	 *
	 * Displays real-time connection pool statistics and health recommendations.
	 * Shows metrics from DatabaseResilience system.
	 */
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	const {
		label = 'Connection Pool',
		theme = 'light',
		icon = 'mdi:database-cog',
		widgetId = undefined,
		size = { w: 2, h: 3 } as WidgetSize,
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

	/**
	 * Get status color based on health
	 */
	function getHealthColor(health: string): string {
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

	/**
	 * Get utilization color
	 */
	function getUtilizationColor(utilization: number): string {
		if (utilization >= 90) return 'text-error-600';
		if (utilization >= 75) return 'text-warning-600';
		return 'text-success-600';
	}

	/**
	 * Get utilization bar color
	 */
	function getUtilizationBarColor(utilization: number): string {
		if (utilization >= 90) return 'bg-error-600';
		if (utilization >= 75) return 'bg-warning-500';
		return 'bg-success-500';
	}

	/**
	 * Get recommendation icon color
	 */
	function getRecommendationIconColor(recommendation: string): string {
		if (recommendation.includes('healthy')) return 'text-success-600';
		if (recommendation.includes('Consider') || recommendation.includes('increase') || recommendation.includes('reduce')) return 'text-warning-600';
		return 'text-info-600';
	}
</script>

<BaseWidget
	{label}
	{theme}
	{icon}
	{size}
	{onSizeChange}
	endpoint="/api/database/pool-diagnostics"
	pollInterval={30000}
	{widgetId}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: diagnostics, isLoading, error })}
		{#if isLoading && !diagnostics}
			<!-- Loading State -->
			<div class="flex items-center justify-center py-8">
				<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
			</div>
		{:else if error}
			<!-- Error State -->
			<div class="rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-900/20">
				<p class="text-sm text-error-800 dark:text-error-200">{error}</p>
			</div>
		{:else if diagnostics}
			<!-- Health Status Badge -->
			<div class="mb-4">
				<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {getHealthColor(diagnostics.healthStatus)}">
					<span class="mr-2 h-2 w-2 rounded-full bg-current"></span>
					{diagnostics.healthStatus.charAt(0).toUpperCase() + diagnostics.healthStatus.slice(1)}
				</span>
			</div>

			<!-- Statistics Grid -->
			<div class="mb-6 grid grid-cols-2 gap-4">
				<!-- Total Connections -->
				<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-400">Total</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">{diagnostics.totalConnections}</div>
				</div>

				<!-- Active Connections -->
				<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-400">Active</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">{diagnostics.activeConnections}</div>
				</div>

				<!-- Idle Connections -->
				<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-400">Idle</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">{diagnostics.idleConnections}</div>
				</div>

				<!-- Waiting Requests -->
				<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-400">Waiting</div>
					<div class="text-2xl font-bold {diagnostics.waitingRequests > 0 ? 'text-warning-600' : 'text-surface-900 dark:text-white'}">
						{diagnostics.waitingRequests}
					</div>
				</div>
			</div>

			<!-- Utilization Bar -->
			<div class="mb-6">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-medium text-surface-700 dark:text-surface-300">Pool Utilization</span>
					<span class="text-sm font-semibold {getUtilizationColor(diagnostics.poolUtilization)}">
						{diagnostics.poolUtilization.toFixed(1)}%
					</span>
				</div>
				<div class="h-3 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
					<div
						class="h-full rounded-full transition-all duration-500 {getUtilizationBarColor(diagnostics.poolUtilization)}"
						style="width: {Math.min(diagnostics.poolUtilization, 100)}%"
					></div>
				</div>
			</div>

			<!-- Recommendations -->
			{#if diagnostics.recommendations && diagnostics.recommendations.length > 0}
				<div class="border-t border-surface-200 pt-4 dark:border-surface-700">
					<h4 class="mb-2 text-sm font-semibold text-surface-700 dark:text-surface-300">Recommendations</h4>
					<ul class="space-y-2">
						{#each diagnostics.recommendations as recommendation}
							<li class="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400">
								<svg
									class="mt-0.5 h-4 w-4 shrink-0 {getRecommendationIconColor(recommendation)}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span>{recommendation}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	{/snippet}
</BaseWidget>
