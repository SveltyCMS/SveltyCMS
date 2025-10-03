<!--
@file src/routes/(app)/dashboard/widgets/CacheMonitorWidget.svelte
@component 
**Real-time cache performance monitoring widget**
Displays cache hit rates, metrics by category, and tenant-specific statistics
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Cache Monitor',
		icon: 'mdi:database-clock',
		description: 'Monitor cache performance and hit rates',
		defaultSize: { w: 2, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';

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
		timestamp: number;
	}

	const {
		label = 'Cache Monitor',
		theme = 'light',
		icon = 'mdi:database-clock',
		widgetId = undefined,
		size = { w: 2, h: 2 },
		onSizeChange = () => {},
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

	// Color coding for hit rates
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

<BaseWidget {label} {theme} endpoint="/api/dashboard/cache-metrics" pollInterval={5000} {icon} {widgetId} {size} {onSizeChange} {onCloseRequest}>
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
			<div class="flex h-full flex-col space-y-4 overflow-auto text-sm">
				<!-- Overall Cache Performance -->
				<div class="rounded-lg bg-surface-100/50 p-3 dark:bg-surface-800/50">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-400">Overall Performance</h3>
						<span class={`text-2xl font-bold ${getHitRateColor(metrics.overall.hitRate)}`}>
							{metrics.overall.hitRate.toFixed(1)}%
						</span>
					</div>

					<div class="grid grid-cols-4 gap-2 text-xs">
						<div class="text-center">
							<div class="font-semibold text-success-500">{formatNumber(metrics.overall.hits)}</div>
							<div class="text-surface-500">Hits</div>
						</div>
						<div class="text-center">
							<div class="font-semibold text-error-500">{formatNumber(metrics.overall.misses)}</div>
							<div class="text-surface-500">Misses</div>
						</div>
						<div class="text-center">
							<div class="font-semibold text-primary-500">{formatNumber(metrics.overall.sets)}</div>
							<div class="text-surface-500">Sets</div>
						</div>
						<div class="text-center">
							<div class="font-semibold text-warning-500">{formatNumber(metrics.overall.deletes)}</div>
							<div class="text-surface-500">Deletes</div>
						</div>
					</div>

					<!-- Progress Bar -->
					<div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
						<div
							class="h-full bg-gradient-to-r from-success-500 to-primary-500 transition-all duration-500"
							style="width: {metrics.overall.hitRate}%"
						></div>
					</div>
				</div>

				<!-- By Category -->
				{#if Object.keys(metrics.byCategory).length > 0}
					<div class="rounded-lg bg-surface-100/50 p-3 dark:bg-surface-800/50">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-400">By Category</h3>
						<div class="space-y-2">
							{#each Object.entries(metrics.byCategory).slice(0, 6) as [category, stats]}
								<div class="flex items-center justify-between text-xs">
									<div class="flex items-center gap-2">
										<iconify-icon icon={getCategoryIcon(category)} width="16" class="text-surface-500"></iconify-icon>
										<span class="font-medium">{category}</span>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-surface-500">{formatNumber(stats.hits)}/{formatNumber(stats.hits + stats.misses)}</span>
										<span class={`font-semibold ${getHitRateColor(stats.hitRate)}`}>
											{stats.hitRate.toFixed(0)}%
										</span>
									</div>
								</div>
								<div class="h-1 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
									<div
										class="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-300"
										style="width: {stats.hitRate}%"
									></div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- By Tenant (if available) -->
				{#if metrics.byTenant && Object.keys(metrics.byTenant).length > 0}
					<div class="rounded-lg bg-surface-100/50 p-3 dark:bg-surface-800/50">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-400">By Tenant</h3>
						<div class="space-y-2">
							{#each Object.entries(metrics.byTenant).slice(0, 4) as [tenant, stats]}
								<div class="flex items-center justify-between text-xs">
									<div class="flex items-center gap-2">
										<iconify-icon icon="mdi:domain" width="16" class="text-surface-500"></iconify-icon>
										<span class="font-medium">{tenant}</span>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-surface-500">{formatNumber(stats.hits + stats.misses)} ops</span>
										<span class={`font-semibold ${getHitRateColor(stats.hitRate)}`}>
											{stats.hitRate.toFixed(0)}%
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Cache Health Indicator -->
				<div
					class={`mt-auto rounded-lg border-l-4 p-2 text-xs
					${metrics.overall.hitRate >= 80 ? 'border-success-500 bg-success-50 dark:bg-success-900/20' : ''}
					${metrics.overall.hitRate >= 60 && metrics.overall.hitRate < 80 ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/20' : ''}
					${metrics.overall.hitRate < 60 ? 'border-error-500 bg-error-50 dark:bg-error-900/20' : ''}
				`}
				>
					<div class="flex items-center gap-2">
						<iconify-icon
							icon={metrics.overall.hitRate >= 80 ? 'mdi:check-circle' : metrics.overall.hitRate >= 60 ? 'mdi:alert' : 'mdi:alert-circle'}
							width="16"
							class={metrics.overall.hitRate >= 80 ? 'text-success-500' : metrics.overall.hitRate >= 60 ? 'text-warning-500' : 'text-error-500'}
						></iconify-icon>
						<span class="font-medium">
							{#if metrics.overall.hitRate >= 80}
								Cache performing excellently
							{:else if metrics.overall.hitRate >= 60}
								Cache performance is moderate
							{:else}
								Cache performance needs attention
							{/if}
						</span>
					</div>
					<div class="mt-1 text-surface-600 dark:text-surface-400">
						{metrics.overall.totalOperations.toLocaleString()} total operations
					</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
