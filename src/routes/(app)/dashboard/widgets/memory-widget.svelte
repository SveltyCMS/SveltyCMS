<!-- 
@file src/routes/(app)/dashboard/widgets/memory-widget.svelte
@component
**High-performance Memory Usage Widget using native SVG with Swap and compact support**

### Props
- `label` (string): The label for the widget (default: 'Memory Usage')
- `theme` (string): Theme mode ('light' | 'dark')
- `icon` (string): Icon identifier (default: 'mdi:memory')
- `size` (WidgetSize): Widget dimensions (default: { w: 1, h: 2 })

### Features:
- Concentric SVG rings for RAM and Swap (if available)
- Compact row layout for `h:1` size
- Pure SVG rendering with hover interactions
- Complete dark-mode and WCAG keyboard/screen-reader accessibility
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Memory Usage",
	icon: "mdi:memory",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	const {
		label = 'Memory Usage',
		theme = 'light',
		icon = 'mdi:memory',
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

	let activeRing = $state(false); // subtle hover glow effect
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/systemInfo?type=memory"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const mem = (() => {
			const totalObj = data?.memoryInfo?.total || {};
			const usedMb = Number(totalObj.usedMemMb ?? 0);
			const freeMb = Number(totalObj.freeMemMb ?? 0);
			const totalMb = usedMb + freeMb;
			const percent = Number(totalObj.usedMemPercentage ?? 0);

			const swapObj = data?.memoryInfo?.swap;
			const swapUsedMb = swapObj ? Number(swapObj.usedMemMb ?? 0) : 0;
			const swapFreeMb = swapObj ? Number(swapObj.freeMemMb ?? 0) : 0;
			const swapTotalMb = swapUsedMb + swapFreeMb;
			const swapPercent = swapObj ? Number(swapObj.usedMemPercentage ?? 0) : null;

			return {
				totalGB: totalMb / 1024,
				usedGB: usedMb / 1024,
				freeGB: freeMb / 1024,
				percent: Math.min(100, Math.max(0, percent)),
				level: percent > 80 ? 'high' : percent > 60 ? 'medium' : 'low',
				freePercent: Math.max(0, 100 - percent),

				swapTotalGB: swapTotalMb / 1024,
				swapUsedGB: swapUsedMb / 1024,
				swapFreeGB: swapFreeMb / 1024,
				swapPercent: swapPercent !== null ? Math.min(100, Math.max(0, swapPercent)) : null,
				swapLevel: swapPercent !== null ? (swapPercent > 80 ? 'high' : swapPercent > 60 ? 'medium' : 'low') : 'low'
			};
		})()}

		{#if data?.memoryInfo?.total}
			<div class="flex h-full flex-col justify-between space-y-4" role="region" aria-label="Memory usage statistics">
				
				{#if size.h === 1}
					<!-- Compact single-row layout -->
					<div class="flex items-center justify-between text-xs px-1 w-full h-full min-h-[36px]">
						<div class="flex items-center gap-2">
							<div class="relative flex h-2.5 w-2.5">
								<span class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping {mem.level === 'high' ? 'bg-red-400' : mem.level === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
								<span class="relative inline-flex rounded-full h-2.5 w-2.5 {mem.level === 'high' ? 'bg-red-500' : mem.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
							</div>
							<span class="font-bold tabular-nums text-sm">{mem.percent.toFixed(1)}%</span>
							<span class="text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider text-[10px]">RAM</span>
						</div>
						<div class="flex items-center gap-2 text-right">
							<span class="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{mem.usedGB.toFixed(1)} / {mem.totalGB.toFixed(0)} GB</span>
							{#if mem.swapPercent !== null}
								<span class="text-gray-400 dark:text-gray-500">| Swap: <span class="font-semibold text-gray-600 dark:text-gray-400">{mem.swapPercent.toFixed(0)}%</span></span>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Header Status -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="relative">
								<div class="h-4 w-4 rounded-full {mem.level === 'high' ? 'bg-red-500' : mem.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}"></div>
								<div class="absolute inset-0 h-4 w-4 rounded-full {mem.level === 'high' ? 'bg-red-500' : mem.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'} animate-ping opacity-75"></div>
							</div>
							<div>
								<span class="text-3xl font-semibold tabular-nums tracking-tighter">{mem.percent.toFixed(1)}</span>
								<span class="text-xl font-medium text-gray-400">%</span>
							</div>
							<span class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Used</span>
						</div>

						<div class="text-right">
							<div class="text-sm font-medium tabular-nums">{mem.freeGB.toFixed(1)} GB <span class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">free</span></div>
						</div>
					</div>

					<!-- SVG Concentric Doughnuts -->
					<div class="relative flex items-center justify-center py-2" style="min-height: 148px;">
						<div 
							class="relative focus:outline-hidden"
							onmouseenter={() => (activeRing = true)}
							onmouseleave={() => (activeRing = false)}
							role="img"
							aria-label="Concentric memory usage chart. Outer ring is physical RAM, inner ring is swap space."
						>
							<svg width="148" height="148" viewBox="0 0 42 42" class="transform -rotate-90 overflow-visible">
								<!-- Outer RAM background ring -->
								<circle
									cx="21"
									cy="21"
									r="15.915"
									fill="none"
									stroke={theme === 'dark' ? '#1f2937' : '#f3f4f6'}
									stroke-width="3"
								/>
								<!-- Outer RAM progress ring -->
								<circle
									cx="21"
									cy="21"
									r="15.915"
									fill="none"
									stroke-width="3"
									stroke-dasharray="100"
									stroke-dashoffset={100 - mem.percent}
									stroke-linecap="round"
									class="transition-all duration-700 ease-out {mem.level === 'high' ? 'stroke-error-500' : mem.level === 'medium' ? 'stroke-warning-500' : 'stroke-success-500'}"
									style="filter: {activeRing ? 'brightness(1.08)' : 'none'};"
								/>

								<!-- Inner Swap Rings (if available in the backend) -->
								{#if mem.swapPercent !== null}
									<!-- Inner Swap background ring -->
									<circle
										cx="21"
										cy="21"
										r="12.5"
										fill="none"
										stroke={theme === 'dark' ? '#111827' : '#e5e7eb'}
										stroke-width="1.8"
									/>
									<!-- Inner Swap progress ring -->
									<circle
										cx="21"
										cy="21"
										r="12.5"
										fill="none"
										stroke-width="1.8"
										stroke-dasharray="78.54"
										stroke-dashoffset={78.54 * (1 - mem.swapPercent / 100)}
										stroke-linecap="round"
										class="transition-all duration-700 ease-out {mem.swapLevel === 'high' ? 'stroke-error-500' : mem.swapLevel === 'medium' ? 'stroke-warning-500' : 'stroke-tertiary-500'}"
									/>
								{/if}
							</svg>

							<!-- Center Content -->
							<div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
								<span class="text-3xl font-semibold tabular-nums {theme === 'dark' ? 'text-white' : 'text-gray-900'}">
									{mem.percent.toFixed(0)}
								</span>
								<span class="text-[9px] font-bold tracking-widest uppercase {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">RAM USED</span>
							</div>
						</div>
					</div>

					<!-- Statistics -->
					<div class="space-y-4">
						<div class="grid {size.w === 1 ? 'grid-cols-2' : 'grid-cols-3'} gap-4 text-center text-sm">
							<div>
								<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</div>
								<div class="font-semibold tabular-nums mt-0.5">{mem.totalGB.toFixed(1)} GB</div>
							</div>
							<div>
								<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</div>
								<div class="font-semibold tabular-nums mt-0.5 {mem.level === 'high' ? 'text-red-500' : mem.level === 'medium' ? 'text-amber-500' : 'text-emerald-500'}">
									{mem.usedGB.toFixed(1)} GB
								</div>
							</div>
							{#if size.w > 1}
								<div>
									<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Free</div>
									<div class="font-semibold tabular-nums mt-0.5">{mem.freeGB.toFixed(1)} GB</div>
								</div>
							{/if}
						</div>

						<!-- Compact Swap Stats sub-section -->
						{#if mem.swapPercent !== null}
							<div class="border-t pt-2.5 {theme === 'dark' ? 'border-gray-800' : 'border-gray-150'}">
								<div class="flex justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 px-1">
									<span>Swap Memory</span>
									<span class="tabular-nums">{mem.swapPercent.toFixed(0)}% Used</span>
								</div>
								<div class="grid grid-cols-3 gap-2 text-center text-xs">
									<div>
										<div class="text-[10px] text-gray-400 dark:text-gray-500">Total</div>
										<div class="font-medium text-gray-600 dark:text-gray-300 tabular-nums">{mem.swapTotalGB.toFixed(1)} GB</div>
									</div>
									<div>
										<div class="text-[10px] text-gray-400 dark:text-gray-500">Used</div>
										<div class="font-medium text-gray-600 dark:text-gray-300 tabular-nums">{mem.swapUsedGB.toFixed(1)} GB</div>
									</div>
									<div>
										<div class="text-[10px] text-gray-400 dark:text-gray-500">Free</div>
										<div class="font-medium text-gray-600 dark:text-gray-300 tabular-nums">{mem.swapFreeGB.toFixed(1)} GB</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading memory metrics</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	circle {
		transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s;
	}
</style>
