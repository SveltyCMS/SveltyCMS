<!--
@file src\routes\(app)\dashboard\widgets\database-pool-diagnostics.svelte
@component
**Database Pool Diagnostics Widget**
* Displays real-time connection pool statistics and health recommendations.
	 * Shows metrics from DatabaseResilience system.
-->

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
	import { getClientLicenseStatus } from '@utils/client-license-cache';
	import type { LicenseStatus } from '@utils/license-manager';

	let licenseStatus = $state<LicenseStatus | null>(null);

	$effect(() => {
		getClientLicenseStatus('dashboard', 'database-pool-diagnostics').then((status) => {
			licenseStatus = status;
		});
	});

	const isLicensed = $derived(Boolean(licenseStatus?.hasLicense));

	import type { WidgetSize } from '@src/content/types';
	import type { ConnectionPoolDiagnostics } from '@src/databases/database-resilience';
	import BaseWidget from '../../base-widget.svelte';
	import {
		widget_dbpool_total,
		widget_dbpool_active,
		widget_dbpool_idle,
		widget_dbpool_waiting,
		widget_dbpool_utilization,
		widget_dbpool_recommendations,
		widget_dbpool_premium_notice,
		widget_dbpool_upgrade,
		widget_dbpool_loading
	} from '@src/paraglide/messages';

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

	function getHealthColor(healthStatus: string): string {
		switch (healthStatus) {
			case 'healthy':
				return 'bg-success-500/10 text-success-600 dark:bg-success-900/20 dark:text-success-400';
			case 'warning':
				return 'bg-warning-500/10 text-warning-600 dark:bg-warning-900/20 dark:text-warning-400';
			case 'critical':
				return 'bg-error-500/10 text-error-600 dark:bg-error-900/20 dark:text-error-400';
			default:
				return 'bg-surface-500/10 text-surface-600 dark:bg-surface-700/50 dark:text-surface-400';
		}
	}

	function getUtilizationColor(utilization: number): string {
		if (utilization >= 90) return 'text-error-600 dark:text-error-400';
		if (utilization >= 75) return 'text-warning-600 dark:text-warning-400';
		return 'text-success-600 dark:text-success-400';
	}

	function getUtilizationBarColor(utilization: number): string {
		if (utilization >= 90) return 'bg-error-500';
		if (utilization >= 75) return 'bg-warning-500';
		return 'bg-success-500';
	}

	function getRecommendationIconColor(recommendation: string): string {
		if (recommendation.includes('critical') || recommendation.includes('exhaustion')) {
			return 'text-error-500';
		}
		if (recommendation.includes('high') || recommendation.includes('warning')) {
			return 'text-warning-500';
		}
		return 'text-primary-500';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/database-pool"
	pollInterval={5000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{@const diagnostics = data as ConnectionPoolDiagnostics | null}

		{#if !diagnostics}
			<div class="flex h-full items-center justify-center">
				<div class="text-surface-400">{widget_dbpool_loading()}</div>
			</div>
		{:else}
			<!-- Health Status Badge -->
			<div class="mb-4">
				<span
					class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {getHealthColor(
						diagnostics.healthStatus
					)}"
				>
					<span class="me-2 h-2 w-2 rounded-full bg-current"></span>
					{diagnostics.healthStatus.charAt(0).toUpperCase() + diagnostics.healthStatus.slice(1)}
				</span>
			</div>

			<!-- Statistics Grid -->
			<div class="mb-6 grid grid-cols-2 gap-4">
				<!-- Total Connections -->
				<div class="rounded bg-surface-500/10 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-50">
						{widget_dbpool_total()}
					</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">
						{diagnostics.totalConnections}
					</div>
				</div>

				<!-- Active Connections -->
				<div class="rounded bg-surface-500/10 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-50">
						{widget_dbpool_active()}
					</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">
						{diagnostics.activeConnections}
					</div>
				</div>

				<!-- Idle Connections -->
				<div class="rounded bg-surface-500/10 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-50">
						{widget_dbpool_idle()}
					</div>
					<div class="text-2xl font-bold text-surface-900 dark:text-white">
						{diagnostics.idleConnections}
					</div>
				</div>

				<!-- Waiting Requests -->
				<div class="rounded bg-surface-500/10 p-3 dark:bg-surface-700/50">
					<div class="mb-1 text-xs text-surface-500 dark:text-surface-50">
						{widget_dbpool_waiting()}
					</div>
					<div
						class="text-2xl font-bold {diagnostics.waitingRequests > 0
							? 'text-warning-600'
							: 'text-surface-900 dark:text-white'}"
					>
						{diagnostics.waitingRequests}
					</div>
				</div>
			</div>

			<!-- Utilization Bar -->
			<div class="mb-6">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-medium text-surface-600 dark:text-surface-400"
						>{widget_dbpool_utilization()}</span
					>
					<span class="text-sm font-semibold {getUtilizationColor(diagnostics.poolUtilization)}">
						{diagnostics.poolUtilization.toFixed(1)}%
					</span>
				</div>
				<div class="h-3 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
					<div
						class="h-full rounded-full transition-all duration-500 {getUtilizationBarColor(
							diagnostics.poolUtilization
						)}"
						style="width: {Math.min(diagnostics.poolUtilization, 100)}%"
					></div>
				</div>
			</div>

			<!-- Recommendations -->
			{#if diagnostics.recommendations && diagnostics.recommendations.length > 0}
				<div class="border-t border-surface-500/30 pt-4 dark:text-surface-50">
					<h4 class="mb-2 text-sm font-semibold text-surface-600 dark:text-surface-400">
						{widget_dbpool_recommendations()}
					</h4>
					<ul class="space-y-2">
						{#each diagnostics.recommendations as recommendation (recommendation)}
							<li class="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-50">
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

			<!-- Premium upgrade banner -->
			{#if !isLicensed}
				<div
					class="mt-4 rounded-lg bg-warning-500/10 dark:bg-warning-900/20 border border-warning-500/20 dark:border-warning-500/40 px-3 py-2 flex items-center justify-between"
				>
					<span class="text-xs text-warning-600 dark:text-warning-400">
						<iconify-icon icon="mdi:crown" class="inline me-1 text-warning-500"></iconify-icon>
						{widget_dbpool_premium_notice()}
					</span>
					<a
						href="https://marketplace.sveltycms.com"
						target="_blank"
						class="text-xs font-medium text-warning-600 dark:text-warning-400 hover:text-warning-600 underline shrink-0 ms-3"
						>{widget_dbpool_upgrade()}</a
					>
				</div>
			{/if}
		{/if}
	{/snippet}
</BaseWidget>
