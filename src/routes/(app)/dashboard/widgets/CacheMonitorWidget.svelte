<!--
@file src/routes/(app)/dashboard/widgets/CacheMonitorWidget.svelte
@component 
**Real-time cache performance monitoring widget with enhanced features**
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Cache Monitor',
		icon: 'mdi:database-clock',
		description: 'Monitor cache performance and hit rates',
		defaultSize: { w: 2, h: 3 },
		category: 'monitoring' // Used for defaults
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';

	import type { WidgetSize } from '@src/content/types';

	interface CacheMetrics {
		overall: {
			hits: number;
			misses: number;
			sets: number;
			deletes: number;
			hitRate: number;
			totalOperations: number;
		};
		byCategory: {
			[key: string]: {
				hits: number;
				misses: number;
				hitRate: number;
			};
		};
		byTenant?: {
			[key: string]: {
				hits: number;
				misses: number;
				hitRate: number;
			};
		};
		recentMisses?: Array<any>;
		timestamp: number;
	}

	const {
		label = 'Cache Monitor',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:database-clock',
		widgetId = undefined,
		size = { w: 2, h: 3 } as WidgetSize,
		onSizeChange = (_newSize: any) => {},
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

	function getHitRateColor(hitRate: number): string {
		if (hitRate >= 90) return 'text-success-500';
		if (hitRate >= 70) return 'text-warning-500';
		return 'text-error-500';
	}

	function formatNumber(num: number): string {
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
		return num.toString();
	}

	function getCategoryIcon(category: string): string {
		const icons: Record<string, string> = {
			SCHEMA: 'mdi:database-outline',
			WIDGET: 'mdi:widgets-outline',
			THEME: 'mdi:palette-outline',
			CONTENT: 'mdi:file-document-outline',
			MEDIA: 'mdi:image-outline',
			QUERY: 'mdi:magnify',
			SESSION: 'mdi:account-clock-outline',
			AUTH: 'mdi:shield-account-outline',
			PREFERENCE: 'mdi:cog-outline'
		};
		return icons[category] || 'mdi:folder-outline';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/cache-metrics"
	pollInterval={5000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{@const metrics = data as CacheMetrics | null}

		{#if !metrics}
			<div class="flex h-full items-center justify-center text-surface-500">
				<div class="text-center">
					<iconify-icon icon="mdi:database-clock" width="48" class="mb-2 opacity-50"></iconify-icon>
					<p>Loading cache metrics...</p>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col space-y-3 overflow-auto p-1 text-sm">
				<!-- Overall Cache Performance -->
				<div class="rounded-xl bg-gradient-to-br from-preset-50 to-preset-100 p-4 shadow-sm dark:from-preset-800 dark:to-preset-900">
					<div class="mb-3 flex items-start justify-between">
						<div>
							<h3 class="text-xs font-semibold uppercase tracking-wider">Overall Performance</h3>
							<p class="mt-1 text-xs text-surface-600 dark:text-surface-400">
								{metrics.overall.totalOperations.toLocaleString()} operations
							</p>
						</div>
						<div class="text-right">
							<div class={`text-3xl font-bold leading-none ${getHitRateColor(metrics.overall.hitRate)}`}>
								{metrics.overall.hitRate.toFixed(1)}%
							</div>
							<p class="mt-1 text-xs">hit rate</p>
						</div>
					</div>

					<!-- Stats Grid -->
					<div class="grid grid-cols-4 gap-2 text-xs">
						<div class="rounded-lg bg-success-50 p-2 text-center dark:bg-success-900/20">
							<div class="text-lg font-bold">{formatNumber(metrics.overall.hits)}</div>
							<div class="mt-0.5 text-success-700 dark:text-success-500">Hits</div>
						</div>
						<div class="rounded-lg bg-error-50 p-2 text-center dark:bg-error-900/20">
							<div class="text-lg font-bold">{formatNumber(metrics.overall.misses)}</div>
							<div class="mt-0.5 text-error-700 dark:text-error-500">Misses</div>
						</div>
						<div class="rounded-lg bg-primary-50 p-2 text-center dark:bg-primary-900/20">
							<div class="0 text-lg font-bold">{formatNumber(metrics.overall.sets)}</div>
							<div class="mt-0.5 text-primary-700 dark:text-primary-500">Sets</div>
						</div>
						<div class="rounded-lg bg-warning-50 p-2 text-center dark:bg-warning-900/20">
							<div class="text-lg font-bold">{formatNumber(metrics.overall.deletes)}</div>
							<div class="mt-0.5 text-warning-700 dark:text-warning-500">Deletes</div>
						</div>
					</div>

					<!-- Progress Bar -->
					<div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
						<div
							class="h-full bg-linear-to-r from-success-500 via-primary-500
							to-primary-600 transition-all duration-500 ease-out"
							style="width: {metrics.overall.hitRate}%"
						></div>
					</div>
				</div>

				<!-- By Category -->
				{#if Object.keys(metrics.byCategory).length > 0}
					<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50">
						<h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
							<iconify-icon icon="mdi:view-grid" width="14"></iconify-icon>
							By Category
						</h3>
						<div class="space-y-3">
							{#each Object.entries(metrics.byCategory).slice(0, 6) as [category, stats]}
								<div class="group">
									<div class="flex items-center justify-between text-xs">
										<div class="flex items-center gap-2">
											<iconify-icon
												icon={getCategoryIcon(category)}
												width="18"
												class="text-surface-600 transition-colors group-hover:text-primary-500 dark:text-surface-400"
											></iconify-icon>
											<span class="font-semibold">{category.toLowerCase()}</span>
										</div>
										<div class="flex items-center gap-3">
											<span class="tabular-nums text-surface-500">
												{formatNumber(stats.hits)}<span class="text-surface-400">/</span>{formatNumber(stats.hits + stats.misses)}
											</span>
											<span class={`min-w-[3rem] text-right text-sm font-bold tabular-nums ${getHitRateColor(stats.hitRate)}`}>
												{stats.hitRate.toFixed(0)}%
											</span>
										</div>
									</div>
									<div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
										<div
											class={`h-full transition-all duration-300 ${
												stats.hitRate >= 80
													? 'bg-linear-to-r from-success-400 to-success-600'
													: stats.hitRate >= 60
														? 'bg-linear-to-r from-warning-400 to-warning-600'
														: 'bg-linear-to-r from-error-400 to-error-600'
											}`}
											style="width: {stats.hitRate}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- By Tenant (if available) -->
				{#if metrics.byTenant && Object.keys(metrics.byTenant).length > 0}
					<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50">
						<h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-400">
							<iconify-icon icon="mdi:domain" width="14"></iconify-icon>
							By Tenant
						</h3>
						<div class="space-y-2.5">
							{#each Object.entries(metrics.byTenant).slice(0, 4) as [tenant, stats]}
								<div class="flex items-center justify-between rounded-lg bg-surface-100/50 px-3 py-2 text-xs dark:bg-surface-900/30">
									<div class="flex items-center gap-2">
										<div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
											<iconify-icon icon="mdi:domain" width="14" class="text-primary-600 dark:text-primary-400"></iconify-icon>
										</div>
										<span class="font-semibold text-surface-700 dark:text-surface-300">{tenant}</span>
									</div>
									<div class="flex items-center gap-3">
										<span class="tabular-nums text-surface-500">{formatNumber(stats.hits + stats.misses)} ops</span>
										<span class={`min-w-[3rem] text-right font-bold tabular-nums ${getHitRateColor(stats.hitRate)}`}>
											{stats.hitRate.toFixed(0)}%
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Recent Cache Misses -->
				{#if metrics.recentMisses && metrics.recentMisses.length > 0}
					<div class="rounded-xl bg-error-50 p-4 dark:bg-error-900/10">
						<h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-error-700 dark:text-error-400">
							<iconify-icon icon="mdi:alert-circle" width="14"></iconify-icon>
							Recent Cache Misses ({metrics.recentMisses.length})
						</h3>
						<div class="max-h-48 space-y-2 overflow-y-auto">
							{#each metrics.recentMisses.slice().reverse() as miss}
								{@const timeSince = Math.floor((Date.now() - new Date(miss.timestamp).getTime()) / 1000)}
								<div class="rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-surface-900/30">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<div class="mb-1 flex items-center gap-2">
												<iconify-icon icon={getCategoryIcon(miss.category)} width="14" class="text-error-600 dark:text-error-400"></iconify-icon>
												<span class="font-semibold">{miss.category}</span>
											</div>
											<div class="truncate font-mono text-[10px] text-surface-600 dark:text-surface-400" title={miss.key}>
												{miss.key}
											</div>
										</div>
										<div class="whitespace-nowrap text-right">
											<div class="text-[10px]">
												{#if timeSince < 60}
													{timeSince}s ago
												{:else if timeSince < 3600}
													{Math.floor(timeSince / 60)}m ago
												{:else}
													{Math.floor(timeSince / 3600)}h ago
												{/if}
											</div>
											{#if miss.tenantId}
												<div class="mt-0.5 text-[10px] text-surface-400">
													{miss.tenantId}
												</div>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Cache Health Indicator -->
				<div
					class={`mt-auto rounded-xl border-l-4 p-3 text-xs shadow-sm transition-all
					${metrics.overall.hitRate >= 80 ? 'border-success-500 bg-success-50 dark:bg-success-900/10' : ''}
					${metrics.overall.hitRate >= 60 && metrics.overall.hitRate < 80 ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/10' : ''}
					${metrics.overall.hitRate < 60 ? 'border-error-500 bg-error-50 dark:bg-error-900/10' : ''}
				`}
				>
					<div class="flex items-center gap-2.5">
						<div
							class={`flex h-8 w-8 items-center justify-center rounded-full ${
								metrics.overall.hitRate >= 80
									? 'bg-success-100 dark:bg-success-900/30'
									: metrics.overall.hitRate >= 60
										? 'bg-warning-100 dark:bg-warning-900/30'
										: 'bg-error-100 dark:bg-error-900/30'
							}`}
						>
							<iconify-icon
								icon={metrics.overall.hitRate >= 80 ? 'mdi:check-circle' : metrics.overall.hitRate >= 60 ? 'mdi:alert' : 'mdi:alert-circle'}
								width="18"
								class={metrics.overall.hitRate >= 80
									? 'text-success-600 dark:text-success-400'
									: metrics.overall.hitRate >= 60
										? 'text-warning-600 dark:text-warning-400'
										: 'text-error-600 dark:text-error-400'}
							></iconify-icon>
						</div>
						<div class="flex-1">
							<div
								class={`font-semibold ${
									metrics.overall.hitRate >= 80
										? 'text-success-700 dark:text-success-300'
										: metrics.overall.hitRate >= 60
											? 'text-warning-700 dark:text-warning-300'
											: 'text-error-700 dark:text-error-300'
								}`}
							>
								{#if metrics.overall.hitRate >= 80}
									Excellent Performance
								{:else if metrics.overall.hitRate >= 60}
									Moderate Performance
								{:else}
									Needs Attention
								{/if}
							</div>
							<div class="mt-0.5">
								Cache is {metrics.overall.hitRate >= 80
									? 'working optimally'
									: metrics.overall.hitRate >= 60
										? 'performing adequately'
										: 'underperforming'}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
