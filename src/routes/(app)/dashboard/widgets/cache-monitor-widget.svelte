<!--
@file src/routes/(app)/dashboard/widgets/CacheMonitorWidget.svelte
@component
**Modern Cache Performance Monitor — Hit rates, throughput, and cache size with adaptive layouts**

### Props
- `label` (string): Widget label (default: 'Cache Performance')
- `size` (WidgetSize): Controls layout — h:1 compact summary, h:2+ per-category breakdown

### Features:
- Adaptive layout: compact (h:1) single-row summary, rich (h:2+) per-category cards
- Color-coded hit rates with progress bars (green ≥90%, amber ≥70%, red <70%)
- Cache size visualization in human-readable units (B → KB → MB → GB)
- Hits/misses breakdown with formatted numbers
- Category-level monitoring (auth, api, etc.)
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Cache Performance",
	icon: "mdi:cached",
	description: "Monitor cache efficiency and size",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface CacheStat {
		hits: number;
		misses: number;
		hitRate: number;
		sets?: number;
		deletes?: number;
		size: number;
		totalOperations?: number;
		items?: number;
	}

	interface CacheResponse {
		overall: CacheStat;
		byCategory: Record<string, CacheStat>;
		timestamp: number;
	}

	const {
		label = 'Cache Performance',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:cached',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	function fmtNum(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return n.toLocaleString();
	}

	function fmtSize(bytes: number): string {
		if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
		if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
		if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
		return `${bytes} B`;
	}

	function hitRateClass(rate: number): string {
		if (rate >= 90) return 'text-emerald-500';
		if (rate >= 70) return 'text-amber-500';
		return 'text-red-500';
	}

	function barColor(rate: number): string {
		if (rate >= 90) return 'bg-emerald-500';
		if (rate >= 70) return 'bg-amber-500';
		return 'bg-red-500';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/cache-metrics"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const cache = data as CacheResponse | null}
		{const hasData = cache?.overall != null}

		{#if !hasData}
			<!-- ===== Empty / Loading ===== -->
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:cached" class="text-4xl opacity-20 mb-3" ></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No cache data</div>
				<div class="text-xs text-surface-400 mt-1">Metrics will appear as traffic flows</div>
			</div>
		{:else if isCompact}
			{const o = cache.overall}
			<!-- ===== Compact (h:1) ===== -->
			<div class="flex h-full items-center gap-3 overflow-hidden">
				<!-- Hit rate badge -->
				<div class="flex shrink-0 items-center gap-1.5">
					<span class="text-lg font-bold tabular-nums {hitRateClass(o.hitRate)}">
						{o.hitRate.toFixed(0)}%
					</span>
					<span class="text-xs text-surface-500">hit rate</span>
				</div>

				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>

				<!-- Mini progress bar -->
				<div class="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
					<div class="h-full rounded-full transition-all duration-700 {barColor(o.hitRate)}" style="width: {Math.max(6, o.hitRate)}%"></div>
				</div>

				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>

				<!-- Inline stats -->
				<div class="flex items-center gap-3 text-xs">
					<span class="tabular-nums text-surface-500">
						<span class="text-emerald-500 font-medium">{fmtNum(o.hits)}</span> hits
					</span>
					<span class="tabular-nums text-surface-500">
						<span class="text-red-500 font-medium">{fmtNum(o.misses)}</span> misses
					</span>
					<span class="tabular-nums font-medium text-blue-500">{fmtSize(o.size)}</span>
				</div>
			</div>
		{:else}
			{const o = cache.overall}
			<!-- ===== Rich (h:2+) ===== -->
			<div class="flex h-full flex-col space-y-3">
				<!-- Overall Summary -->
				<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">Overall</span>
						<span class="text-xs font-medium text-blue-500 tabular-nums">{fmtSize(o.size)}</span>
					</div>

					<div class="flex items-baseline justify-between mb-2">
						<span class="text-2xl font-semibold tabular-nums {hitRateClass(o.hitRate)}">
							{o.hitRate.toFixed(1)}%
						</span>
						<span class="text-xs text-surface-400">hit rate</span>
					</div>

					<div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700 mb-3">
						<div class="h-full rounded-full transition-all duration-700 {barColor(o.hitRate)}" style="width: {Math.max(8, o.hitRate)}%"></div>
					</div>

					<div class="grid grid-cols-4 gap-2 text-center text-xs">
						<div class="rounded-lg bg-surface-100 p-1.5 dark:bg-surface-700/50">
							<div class="font-mono font-semibold text-emerald-500 tabular-nums">{fmtNum(o.hits)}</div>
							<div class="text-[10px] text-surface-500">Hits</div>
						</div>
						<div class="rounded-lg bg-surface-100 p-1.5 dark:bg-surface-700/50">
							<div class="font-mono font-semibold text-red-500 tabular-nums">{fmtNum(o.misses)}</div>
							<div class="text-[10px] text-surface-500">Misses</div>
						</div>
						<div class="rounded-lg bg-surface-100 p-1.5 dark:bg-surface-700/50">
							<div class="font-mono font-semibold tabular-nums">{fmtNum(o.sets ?? 0)}</div>
							<div class="text-[10px] text-surface-500">Sets</div>
						</div>
						<div class="rounded-lg bg-surface-100 p-1.5 dark:bg-surface-700/50">
							<div class="font-mono font-semibold tabular-nums">{fmtNum(o.deletes ?? 0)}</div>
							<div class="text-[10px] text-surface-500">Evictions</div>
						</div>
					</div>
				</div>

				<!-- Per-Category Breakdown -->
				{#if cache.byCategory && Object.keys(cache.byCategory).length > 0}
					<div class="flex-1 space-y-2 overflow-y-auto pe-0.5 custom-scroll">
						{#each Object.entries(cache.byCategory) as [cat, s] (cat)}
							<div class="rounded-2xl bg-surface-50 p-3 dark:bg-surface-800">
								<div class="flex items-center justify-between mb-2">
									<span class="text-xs font-semibold capitalize text-surface-600 dark:text-surface-300">{cat}</span>
									<span class="text-xs tabular-nums text-blue-500">{fmtSize(s.size)}</span>
								</div>

								<div class="flex items-center justify-between mb-2">
									<span class="text-lg font-semibold tabular-nums {hitRateClass(s.hitRate)}">
										{s.hitRate.toFixed(1)}%
									</span>
									<div class="flex gap-3 text-[11px] text-surface-500">
										<span>{fmtNum(s.hits)} hits</span>
										<span>{fmtNum(s.misses)} misses</span>
									</div>
								</div>

								<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
									<div class="h-full rounded-full transition-all duration-700 {barColor(s.hitRate)}" style="width: {Math.max(6, s.hitRate)}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
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
