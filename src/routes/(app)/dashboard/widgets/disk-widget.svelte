<!-- 
@file src/routes/(app)/dashboard/widgets/disk-widget.svelte
@component
**High-performance Disk Usage Widget using native CSS + SVG with multi-disk support**

### Props
- `label` (string): The label for the widget (default: 'Disk Usage')
- `theme` (string): Theme mode ('light' | 'dark')
- `icon` (string): Icon identifier (default: 'mdi:harddisk')
- `size` (WidgetSize): Widget dimensions (default: { w: 1, h: 2 })

### Features:
- Zero-dependency SVG progress ring visualization
- Dynamic multi-disk tabs selector
- Complete dark-mode integration
- Built-in keyboard accessibility
-->
<script lang="ts" module>
	import Button from '@components/ui/button.svelte';
export const widgetMeta = {
	name: "Disk Usage",
	icon: "mdi:disk",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../base-widget.svelte';

	interface DiskInfo {
		filesystem?: string;
		freeGb: string | number;
		mountPoint?: string;
		totalGb: string | number;
		usedGb: string | number;
		usedPercentage: string | number;
	}

	interface FetchedData {
		diskInfo?: Record<string, DiskInfo>;
	}

	const {
		label = 'Disk Usage',
		theme = 'light',
		icon = 'mdi:harddisk',
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

	// Active disk key state
	let activeDiskKey = $state('root');
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/system-info?type=disk"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		{const disks = (() => {
			if (!fetchedData?.diskInfo) return [];
			return Object.entries(fetchedData.diskInfo).map(([key, value]) => {
				const disk = value as any;
				const total = typeof disk.totalGb === 'string' ? parseFloat(disk.totalGb) : disk.totalGb || 0;
				const used = typeof disk.usedGb === 'string' ? parseFloat(disk.usedGb) : disk.usedGb || 0;
				const percent = typeof disk.usedPercentage === 'string' ? parseFloat(disk.usedPercentage) : disk.usedPercentage || 0;
				return {
					key,
					name: key === 'root' ? 'Root' : `${key.toUpperCase()}:`,
					total: Math.max(0, total),
					used: Math.max(0, used),
					free: Math.max(0, total - used),
					percent: Math.min(100, Math.max(0, percent)),
					freePercent: Math.max(0, 100 - percent),
					level: percent > 85 ? 'high' : percent > 70 ? 'medium' : 'low',
					mountPoint: disk.mountPoint || '/',
					filesystem: disk.filesystem || ''
				};
			});
		})()}

		{const disk = disks.find(d => d.key === activeDiskKey) || disks[0]}

		{#if disk}
			<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Disk usage statistics">
				<!-- Multi-disk Selector tabs (Only shown if more than 1 disk is detected) -->
				{#if disks.length > 1}
					<div 
						class="flex flex-wrap gap-1.5 border-b pb-2 {theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}"
						role="tablist"
						aria-label="Select disk drive"
					>
						{#each disks as d}
							<Button variant="outline">
								type="button"
								role="tab"
								aria-selected={disk.key === d.key}
								class="px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 {disk.key === d.key
									? 'bg-blue-500 text-white shadow-sm'
									: theme === 'dark'
										? 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
										: 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'}"
								onclick={() => (activeDiskKey = d.key)}
							>
								{d.name} ({d.percent.toFixed(0)}%)
							</Button>
						{/each}
					</div>
				{/if}

				<!-- Main Status -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="relative">
							<div class="h-4 w-4 rounded-full {disk.level === 'high' ? 'bg-red-500' : disk.level === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'}"></div>
							<div class="absolute inset-0 h-4 w-4 rounded-full {disk.level === 'high' ? 'bg-red-500' : disk.level === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'} animate-ping opacity-75"></div>
						</div>
						<div>
							<span class="text-3xl font-semibold tabular-nums tracking-tighter">{disk.percent.toFixed(1)}</span>
							<span class="text-xl font-medium text-gray-400">%</span>
						</div>
						<span class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Used</span>
					</div>

					<div class="text-right text-sm">
						<div class="font-medium tabular-nums">{disk.free.toFixed(1)} GB <span class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">free</span></div>
					</div>
				</div>

				<!-- Segmented Visual Bar -->
				<div class="relative h-9 overflow-hidden rounded-2xl {theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} shadow-inner">
					<div
						class="absolute h-full flex items-center justify-center font-semibold text-sm text-white transition-all duration-700 ease-out rounded-2xl {disk.level === 'high' ? 'bg-red-500' : disk.level === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}"
						style="width: {disk.percent}%"
					>
						{#if disk.percent > 15}
							{disk.used.toFixed(1)} GB
						{/if}
					</div>
					<div
						class="absolute h-full flex items-center justify-center font-medium text-sm text-gray-500 dark:text-gray-400 transition-all duration-700 ease-out"
						style="left: {disk.percent}%; width: {disk.freePercent}%"
					>
						{#if disk.freePercent > 15}
							{disk.free.toFixed(1)} GB
						{/if}
					</div>
				</div>

				<!-- Storage Details -->
				<div class="space-y-3">
					<div class="grid {size.w === 1 ? 'grid-cols-2' : 'grid-cols-3'} gap-4 text-center text-sm">
						<div>
							<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</div>
							<div class="font-semibold tabular-nums mt-0.5">{disk.total.toFixed(1)} GB</div>
						</div>
						<div>
							<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</div>
							<div class="font-semibold tabular-nums mt-0.5 {disk.level === 'high' ? 'text-red-500' : disk.level === 'medium' ? 'text-amber-500' : 'text-blue-500'}">
								{disk.used.toFixed(1)} GB
							</div>
						</div>
						{#if size.w > 1}
							<div>
								<div class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Free</div>
								<div class="font-semibold tabular-nums mt-0.5">{disk.free.toFixed(1)} GB</div>
							</div>
						{/if}
					</div>

					<!-- Progress Ring (optional premium touch) -->
					{#if size.h >= 2}
						<div class="flex justify-center pt-2">
							<svg width="92" height="92" class="overflow-visible -rotate-90">
								<circle
									cx="46"
									cy="46"
									r="38"
									fill="none"
									stroke={theme === 'dark' ? '#374151' : '#e5e7eb'}
									stroke-width="11"
								/>
								<circle
									cx="46"
									cy="46"
									r="38"
									fill="none"
									stroke-width="11"
									stroke-dasharray="238.76"
									stroke-dashoffset={238.76 * (1 - disk.percent / 100)}
									stroke-linecap="round"
									class="transition-all duration-700 {disk.level === 'high' ? 'stroke-error-500' : disk.level === 'medium' ? 'stroke-warning-500' : 'stroke-tertiary-500'}"
								/>
								<text
									x="46"
									y="52"
									text-anchor="middle"
									class="text-[22px] font-semibold fill-current {theme === 'dark' ? 'text-white' : 'text-gray-900'}"
								>
									{disk.percent.toFixed(0)}
								</text>
							</svg>
						</div>
					{/if}
				</div>

				{#if size.w >= 2}
					<div class="flex justify-between text-xs pt-2 border-t {theme === 'dark' ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}">
						<span>Mount: <span class="font-mono text-gray-300 dark:text-gray-400">{disk.mountPoint}</span></span>
						{#if disk.filesystem}
							<span>FS: <span class="font-mono text-gray-300 dark:text-gray-400">{disk.filesystem}</span></span>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading disk metrics</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	circle {
		transition: stroke-dashoffset 0.5s ease-in-out, stroke 0.3s;
	}
</style>
