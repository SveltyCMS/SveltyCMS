<!--
@file src/routes/(app)/dashboard/widgets/media-storage-analytics-widget.svelte
@component
**Media Storage Analytics — quota, type breakdown, and actionable insights**

### Props
- `label` (string): Widget label (default: 'Media Storage')
- `size` (WidgetSize): Controls layout — h:1 compact summary, h:2+ rich breakdown

### Features:
- Total asset count and formatted storage usage
- Quota utilization with status coloring
- Top file types by storage share
- Actionable insight cards from storage analytics API
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Media Storage",
	icon: "mdi:chart-pie",
	description: "Media library storage analytics, quota usage, and insights",
	defaultSize: { w: 2, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface MediaAnalytics {
		total: {
			files: number;
			size: number;
			formattedSize: string;
			avgSize?: number;
		};
		byType: Array<{ type: string; count: number; size: number; pct: number }>;
		insights: Array<{ type: string; title: string; desc: string; actionable?: boolean }>;
		trends: Array<{ month: string; uploads: number; addedSize: number; growthPct: number }>;
		quota: {
			used: number;
			available: number;
			percentage: number;
			status: 'healthy' | 'warning' | 'critical';
		};
	}

	const {
		label = 'Media Storage',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:chart-pie',
		widgetId = undefined as string | undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	function quotaColor(status: string): string {
		if (status === 'critical') return 'bg-red-500';
		if (status === 'warning') return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function insightIcon(type: string): string {
		if (type === 'warning') return 'mdi:alert-outline';
		if (type === 'success') return 'mdi:check-circle-outline';
		return 'mdi:information-outline';
	}

	function formatBytes(bytes: number): string {
		if (!bytes) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/media/analytics"
	pollInterval={60000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const analytics = ((data as { success?: boolean; data?: MediaAnalytics })?.data ?? data) as MediaAnalytics | null}

		{#if !analytics?.total}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:chart-donut" class="mb-3 text-4xl opacity-20"></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No storage analytics yet</div>
				<div class="mt-1 text-xs text-surface-400">Upload media to populate insights</div>
			</div>
		{:else if isCompact}
			<div class="flex h-full items-center justify-between gap-3 px-1">
				<div class="min-w-0">
					<div class="text-lg font-bold tabular-nums text-surface-900 dark:text-surface-100">
						{analytics.total.formattedSize}
					</div>
					<div class="text-xs text-surface-500">{analytics.total.files.toLocaleString()} files</div>
				</div>
				<div class="shrink-0 text-end">
					<div class="text-xs font-semibold uppercase tracking-wide text-surface-500">Quota</div>
					<div class="text-sm font-bold tabular-nums {analytics.quota.status === 'critical' ? 'text-red-500' : analytics.quota.status === 'warning' ? 'text-amber-500' : 'text-emerald-500'}">
						{analytics.quota.percentage.toFixed(0)}%
					</div>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col gap-3">
				<div class="grid grid-cols-2 gap-3">
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60">
						<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Total Storage</div>
						<div class="mt-1 text-xl font-bold tabular-nums text-surface-900 dark:text-surface-100">
							{analytics.total.formattedSize}
						</div>
						<div class="mt-0.5 text-xs text-surface-500">{analytics.total.files.toLocaleString()} files</div>
					</div>
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60">
						<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Quota Used</div>
						<div class="mt-1 text-xl font-bold tabular-nums {analytics.quota.status === 'critical' ? 'text-red-500' : analytics.quota.status === 'warning' ? 'text-amber-500' : 'text-emerald-500'}">
							{analytics.quota.percentage.toFixed(1)}%
						</div>
						<div class="mt-0.5 text-xs text-surface-500">{formatBytes(analytics.quota.available)} free</div>
					</div>
				</div>

				<div>
					<div class="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-surface-500">
						<span>Quota</span>
						<span class="capitalize">{analytics.quota.status}</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700" role="progressbar" aria-valuenow={analytics.quota.percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Storage quota usage">
						<div class="h-full transition-all duration-300 {quotaColor(analytics.quota.status)}" style="width: {Math.min(100, analytics.quota.percentage)}%"></div>
					</div>
				</div>

				{#if analytics.byType.length > 0}
					<div class="min-h-0 flex-1 overflow-y-auto">
						<div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-surface-500">Top Types</div>
						<div class="space-y-1.5">
							{#each analytics.byType.slice(0, 4) as item (item.type)}
								<div class="flex items-center gap-2 rounded-xl bg-surface-50 px-3 py-2 dark:bg-surface-800/60">
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-medium capitalize text-surface-800 dark:text-surface-100">{item.type}</div>
										<div class="text-[11px] text-surface-500">{item.count} files · {formatBytes(item.size)}</div>
									</div>
									<div class="shrink-0 text-xs font-semibold tabular-nums text-surface-500">{item.pct.toFixed(0)}%</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if analytics.insights[0]}
					<div class="rounded-xl border border-surface-200 px-3 py-2 text-xs dark:border-surface-700">
						<div class="flex items-start gap-2">
							<iconify-icon icon={insightIcon(analytics.insights[0].type)} class="mt-0.5 shrink-0 text-surface-500"></iconify-icon>
							<div class="min-w-0">
								<div class="font-semibold text-surface-800 dark:text-surface-100">{analytics.insights[0].title}</div>
								<div class="mt-0.5 text-surface-500">{analytics.insights[0].desc}</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</BaseWidget>