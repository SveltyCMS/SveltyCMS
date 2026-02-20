<!-- 
@file src/routes/(app)/dashboard/widgets/cache-monitor-widget.svelte
@component
**Dashboard widget for monitoring cache performance.**
-->

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import BaseWidget from '../base-widget.svelte';

	interface CacheStats {
		hitRate: number;
		hits: number;
		items: number;
		misses: number;
		size: number;
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat('en-US').format(num);
	}

	interface Props {
		config: any;
		widgetId: string;
	}

	let { widgetId, config }: Props = $props();

	let stats = $state<Record<string, CacheStats>>({});
	let isLoading = $state(true);
	let interval: any;

	async function fetchStats() {
		try {
			const response = await fetch('/api/metrics/cache');
			if (response.ok) {
				stats = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch cache stats:', error);
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchStats();
		interval = setInterval(fetchStats, 30_000);
	});

	onDestroy(() => {
		clearInterval(interval);
	});

	function getHitRateColor(rate: number) {
		if (rate >= 90) {
			return 'text-success-500';
		}
		if (rate >= 70) {
			return 'text-warning-500';
		}
		return 'text-error-500';
	}
</script>

<BaseWidget {widgetId} {config} title="Cache Performance" label="Cache Performance" icon="mdi:cached">
	{#if isLoading}
		<div class="flex h-32 items-center justify-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
		</div>
	{:else}
		<div class="space-y-4 p-2">
			{#each Object.entries(stats) as [category, categoryStats]}
				<div class="space-y-1">
					<div class="flex items-center justify-between text-xs font-medium uppercase text-surface-500">
						<span>{category}</span>
						<span>{categoryStats.items} items</span>
					</div>
					<div class="flex items-center gap-3">
						<span class="tabular-nums text-surface-500">
							{formatNumber(categoryStats.hits)}<span class="text-surface-400">/</span>{formatNumber(categoryStats.hits + categoryStats.misses)}
						</span>
						<span class={`min-w-12 text-right text-sm font-bold tabular-nums ${getHitRateColor(categoryStats.hitRate)}`}>
							{categoryStats.hitRate.toFixed(0)}%
						</span>
					</div>
					<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
						<div
							class={`h-full transition-all duration-500 ${categoryStats.hitRate >= 70 ? 'bg-primary-500' : 'bg-warning-500'}`}
							style={`width: ${categoryStats.hitRate}%`}
						></div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</BaseWidget>
