<!-- 
@file src/routes/(app)/dashboard/widgets/scim-status-widget.svelte
@component
**Clean, modern SCIM Identity Synchronization status widget with compact and history tracking**
-->

<script lang="ts" module>
export const widgetMeta = {
	name: "Identity Sync",
	icon: "mdi:cloud-sync",
	description: "Monitor SCIM identity synchronization status",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface ScimMetrics {
		status: 'healthy' | 'degraded' | 'error';
		activeUsers: number;
		lastSync: string;
		syncedToday: number;
		provider: string;
		endpointsHealthy: boolean;
		lastError?: string;
	}

	const {
		label = 'Identity Sync',
		theme = 'light',
		icon = 'mdi:cloud-sync',
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

	// Client-side local history of users synced for sparkline
	let syncHistory = $state<number[]>([]);
	const HISTORY_MAX_POINTS = 15;

	function updateSyncHistory(newData: any) {
		const scim = newData as ScimMetrics | null;
		if (!scim) return;

		syncHistory.push(scim.syncedToday);
		if (syncHistory.length > HISTORY_MAX_POINTS) {
			syncHistory.shift();
		}
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/scim"
	pollInterval={15000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
	onDataLoaded={updateSyncHistory}
>
	{#snippet children({ data })}
		{const scim = data as ScimMetrics | null}

		{#if !scim}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-3 text-surface-500">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					<p class="text-sm">Connecting to identity provider...</p>
				</div>
			</div>
		{:else}
			{const points = syncHistory.map((val: number, i: number) => ({
				x: (i / Math.max(1, syncHistory.length - 1)) * 80,
				y: 18 - (Math.min(50, val) / 50) * 14 - 2 // Normalized trend height
			}))}
			{const linePath = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}

			<div class="flex h-full flex-col justify-between" role="region" aria-label="SCIM Sync status stats">
				{#if size.h === 1}
					<!-- Compact single-row layout -->
					<div class="flex items-center justify-between text-xs px-1 w-full h-full min-h-[36px]">
						<div class="flex items-center gap-2">
							<div class="relative flex h-2.5 w-2.5">
								<span class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping {scim.status === 'healthy' ? 'bg-emerald-400' : scim.status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'}"></span>
								<span class="relative inline-flex rounded-full h-2.5 w-2.5 {scim.status === 'healthy' ? 'bg-emerald-500' : scim.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}"></span>
							</div>
							<span class="font-bold tabular-nums text-sm capitalize {scim.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : scim.status === 'degraded' ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}">{scim.status}</span>
						</div>
						<div class="flex items-center gap-2 text-right">
							<span class="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{scim.activeUsers} Active Users</span>
							{#if scim.syncedToday > 0}
								<span class="text-gray-400 dark:text-gray-500">| +{scim.syncedToday} Today</span>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Status Header -->
					<div class="flex items-center gap-3">
						<div class="relative">
							<div class="h-4 w-4 rounded-full {scim.status === 'healthy' ? 'bg-emerald-500' : scim.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}"></div>
							<div class="absolute inset-0 h-4 w-4 rounded-full {scim.status === 'healthy' ? 'bg-emerald-500' : scim.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'} animate-ping opacity-75"></div>
						</div>
						<div>
							<div class="text-xl font-bold capitalize {scim.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : scim.status === 'degraded' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600'}">
								{scim.status}
							</div>
							<div class="text-xs text-surface-500 dark:text-surface-400">SCIM Sync Status</div>
						</div>
					</div>

					<!-- Main Stats -->
					<div class="my-4 grid grid-cols-2 gap-3.5">
						<div class="rounded-2xl bg-surface-100 p-4 text-center dark:bg-surface-800 border border-transparent dark:border-gray-800">
							<div class="text-3xl font-bold tabular-nums text-surface-900 dark:text-white">
								{scim.activeUsers}
							</div>
							<div class="text-[10px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mt-1">Active Users</div>
						</div>

						<div class="rounded-2xl bg-surface-100 p-4 dark:bg-surface-800 border border-transparent dark:border-gray-800 flex flex-col justify-between items-center relative overflow-hidden">
							<div class="text-3xl font-bold tabular-nums text-surface-900 dark:text-white">
								{scim.syncedToday}
							</div>
							<div class="text-[10px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mt-1">Synced Today</div>
							
							<!-- Client-side mini sparkline for trend -->
							{#if syncHistory.length > 1}
								<div class="w-[80px] h-[16px] overflow-visible mt-1.5 opacity-80 shrink-0">
									<svg viewBox="0 0 80 18" class="w-full h-full overflow-visible">
										<path
											d={linePath}
											fill="none"
											stroke-width="1.8"
											stroke-linecap="round"
											stroke-linejoin="round"
											class={scim.status === 'healthy' ? 'stroke-success-500' : 'stroke-warning-500'}
										/>
									</svg>
								</div>
							{/if}
						</div>
					</div>

					<!-- Details -->
					<div class="space-y-2 text-sm pt-2">
						<div class="flex justify-between items-center py-1">
							<span class="text-surface-500 dark:text-surface-400">Last Sync</span>
							<span class="font-medium font-mono text-surface-700 dark:text-surface-300 tabular-nums">{scim.lastSync}</span>
						</div>
						<div class="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800 pb-2">
							<span class="text-surface-500 dark:text-surface-400">Provider</span>
							<span class="font-mono text-tertiary-600 dark:text-primary-600 dark:text-primary-400 font-semibold">{scim.provider}</span>
						</div>

						{#if scim.lastError}
							<div class="text-xs text-red-500 bg-red-50 dark:bg-red-950/50 p-2.5 rounded-xl border border-red-250 dark:border-red-900/60 mt-1">
								{scim.lastError}
							</div>
						{/if}
					</div>

					<!-- Health Footer -->
					<div class="mt-auto pt-3 border-t border-surface-100 dark:border-surface-700">
						<div class="flex items-center gap-2 text-sm font-medium">
							<iconify-icon 
								icon={scim.endpointsHealthy ? "mdi:check-circle" : "mdi:alert-circle"} 
								width={18}
								class={scim.endpointsHealthy ? "text-emerald-500" : "text-amber-500"}
							></iconify-icon>
							<span class={scim.endpointsHealthy ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}>
								{scim.endpointsHealthy ? "All endpoints healthy" : "Some endpoints degraded"}
							</span>
						</div>
					</div>
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
