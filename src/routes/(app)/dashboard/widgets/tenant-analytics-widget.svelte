<!--
@file src/routes/(app)/dashboard/widgets/tenant-analytics-widget.svelte
@component
**Per-Tenant Analytics Widget — Usage stats scoped to the current tenant**

### Props
- `label` (string): Widget label (default: 'Tenant Analytics')
- `size` (WidgetSize): Controls layout — h:1 compact summary, h:2+ rich breakdown

### Features:
- Total storage used (media files) with formatted display
- Active user count and media asset count
- Number of collections and total content entries
- Recent request activity (last 24h from audit logs)
- Quota-progress bar for storage utilization
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Tenant Analytics",
	icon: "mdi:chart-bar",
	description: "Per-tenant usage statistics — storage, users, collections, and activity",
	defaultSize: { w: 2, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface TenantAnalytics {
		storage: {
			bytes: number;
			formatted: string;
		};
		users: {
			total: number;
		};
		media: {
			total: number;
		};
		collections: number;
		contentEntries: number;
		recentRequests: {
			last24h: number;
		};
		timestamp: string;
	}

	const {
		label = 'Tenant Analytics',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:chart-bar',
		widgetId = undefined as string | undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	function statValue(val: number | undefined | null, suffix = ''): string {
		if (val == null) return '—';
		return val.toLocaleString() + suffix;
	}

	function formatTimestamp(iso: string): string {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Quota — assume 1GB default max for display purposes
	const QUOTA_BYTES = 1_073_741_824; // 1 GB
	const quotaPercentage = $derived.by(() => {
		if (!data?.storage?.bytes) return 0;
		return Math.min(100, (data.storage.bytes / QUOTA_BYTES) * 100);
	});

	function quotaColorClass(pct: number): string {
		if (pct >= 90) return 'bg-red-500';
		if (pct >= 70) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	let data: TenantAnalytics | null = $state(null);

	function handleDataLoaded(newData: any) {
		data = (newData as TenantAnalytics) ?? null;
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/tenant-analytics"
	pollInterval={60000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	onDataLoaded={handleDataLoaded}
>
	{#snippet children({ data: rawData })}
		{const analytics = (rawData as TenantAnalytics) ?? data}

		{#if !analytics}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:chart-bar" class="mb-3 text-4xl opacity-20"></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No analytics yet</div>
				<div class="mt-1 text-xs text-surface-400">Data will appear once content is created</div>
			</div>
		{:else if isCompact}
			<!-- ===== Compact (h:1) ===== -->
			<div class="flex h-full items-center justify-between gap-3 px-1">
				<div class="min-w-0">
					<div class="text-lg font-bold tabular-nums text-surface-900 dark:text-surface-100">
						{statValue(analytics.users.total)}
					</div>
					<div class="text-xs text-surface-500">users</div>
				</div>
				<div class="shrink-0 text-center">
					<div class="text-lg font-bold tabular-nums text-surface-900 dark:text-surface-100">
						{analytics.storage?.formatted ?? '0 B'}
					</div>
					<div class="text-xs text-surface-500">storage</div>
				</div>
				<div class="shrink-0 text-end">
					<div class="text-lg font-bold tabular-nums text-surface-900 dark:text-surface-100">
						{statValue(analytics.recentRequests?.last24h)}
					</div>
					<div class="text-xs text-surface-500">24h req</div>
				</div>
			</div>
		{:else}
			<!-- ===== Rich (h:2+) ===== -->
			<div class="flex h-full flex-col gap-3">
				<!-- Top stat cards -->
				<div class="grid grid-cols-3 gap-2">
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60">
						<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Users</div>
						<div class="mt-1 text-xl font-bold tabular-nums text-surface-900 dark:text-surface-100">
							{statValue(analytics.users.total)}
						</div>
					</div>
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60">
						<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Collections</div>
						<div class="mt-1 text-xl font-bold tabular-nums text-surface-900 dark:text-surface-100">
							{statValue(analytics.collections)}
						</div>
					</div>
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60">
						<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Entries</div>
						<div class="mt-1 text-xl font-bold tabular-nums text-surface-900 dark:text-surface-100">
							{statValue(analytics.contentEntries)}
						</div>
					</div>
				</div>

				<!-- Storage + Activity row -->
				<div class="grid grid-cols-2 gap-2 flex-1">
					<!-- Storage Card -->
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60 flex flex-col justify-between">
						<div>
							<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Storage</div>
							<div class="mt-1 text-lg font-bold tabular-nums text-surface-900 dark:text-surface-100">
								{analytics.storage?.formatted ?? '0 B'}
							</div>
							<div class="text-xs text-surface-500">{statValue(analytics.media.total)} files</div>
						</div>
						<!-- Mini quota bar -->
						<div class="mt-2">
							<div class="flex items-center justify-between text-[10px] text-surface-400 mb-1">
								<span>Quota</span>
								<span>{quotaPercentage.toFixed(0)}%</span>
							</div>
							<div class="h-1.5 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700" role="progressbar" aria-valuenow={quotaPercentage} aria-valuemin={0} aria-valuemax={100} aria-label="Storage quota usage">
								<div class="h-full transition-all duration-300 {quotaColorClass(quotaPercentage)}" style="width: {quotaPercentage}%"></div>
							</div>
						</div>
					</div>

					<!-- Activity Card -->
					<div class="rounded-2xl bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60 flex flex-col justify-between">
						<div>
							<div class="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Activity</div>
							<div class="mt-2 flex items-baseline gap-1">
								<span class="text-3xl font-bold tabular-nums text-surface-900 dark:text-surface-100">
									{statValue(analytics.recentRequests?.last24h)}
								</span>
								<span class="text-xs text-surface-500">requests</span>
							</div>
							<div class="text-xs text-surface-500">in the last 24 hours</div>
						</div>
						<div class="mt-1 text-[10px] text-surface-400">
							Updated {formatTimestamp(analytics.timestamp)}
						</div>
					</div>
				</div>

				<!-- Summary row -->
				<div class="flex items-center gap-2 rounded-xl border border-surface-200 px-3 py-2 text-xs dark:border-surface-700">
					<iconify-icon icon="mdi:information-outline" class="shrink-0 text-surface-400"></iconify-icon>
					<span class="text-surface-600 dark:text-surface-400">
						All metrics are scoped to your organization.
					</span>
				</div>
			</div>
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
</style>
