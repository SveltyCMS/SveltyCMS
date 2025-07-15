<!--
@file src/routes/(app)/dashboard/widgets/DiskWidget.svelte
@component
**A reusable widget component for displaying disk usage information with improved rendering and error handling**

@example
<DiskWidget label="Disk Usage" />

### Props
- `label`: The label for the widget (default: 'Disk Usage')

This widget fetches and displays real-time disk usage data, including:
- Total disk space
- Used disk space
- Free disk space
- Usage percentages

### Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging
-->

<script lang="ts">
	export const widgetMeta = {
		name: 'Disk Usage',
		icon: 'mdi:harddisk',
		defaultW: 1,
		defaultH: 1,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 }
		]
	};

	import { onDestroy, onMount } from 'svelte';
	import { Chart, BarController, BarElement, Tooltip, CategoryScale, LinearScale } from 'chart.js';
	Chart.register(BarController, BarElement, Tooltip, CategoryScale, LinearScale);

	// Components
	import BaseWidget from '../BaseWidget.svelte';
	import { m } from '@src/paraglide/messages';

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = m.diskWidget_label(),
		theme = 'light',
		icon = 'mdi:harddisk',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (newSize) => {},

		// Drag props
		draggable = true,
		onDragStart = (event, item, element) => {},

		// Legacy props
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (spans: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;

		// New sizing props
		currentSize?: '1/4' | '1/2' | '3/4' | 'full';
		availableSizes?: ('1/4' | '1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;

		// Drag props
		draggable?: boolean;
		onDragStart?: (event: MouseEvent, item: any, element: HTMLElement) => void;

		// Legacy props
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	let currentData = $state<any>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);
	let chart = $state<Chart<'bar', number[], string> | undefined>(undefined);

	function updateChartAction(canvas: HTMLCanvasElement, data: any) {
		currentData = data;

		return {
			update(newData: any) {
				currentData = newData;
			}
		};
	}
	// Move diskInfo extraction to script for chart logic
	let diskInfo: any = undefined;
	let totalGB = 0,
		usedGB = 0,
		freeGB = 0,
		usedPercentage = 0,
		freePercentage = 0,
		usageLevel = 'low';
	$effect(() => {
		if (currentData?.diskInfo?.root) {
			diskInfo = currentData.diskInfo.root;
			totalGB = typeof diskInfo.totalGb === 'string' ? parseFloat(diskInfo.totalGb) : diskInfo.totalGb || 0;
			usedGB = typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : diskInfo.usedGb || 0;
			freeGB = typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : diskInfo.freeGb || 0;
			usedPercentage = typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : diskInfo.usedPercentage || 0;
			freePercentage = 100 - usedPercentage;
			usageLevel = usedPercentage > 85 ? 'high' : usedPercentage > 70 ? 'medium' : 'low';
		}
	});
	$effect(() => {
		if (!chartCanvas || !diskInfo) return;
		const used = typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : Number(diskInfo.usedGb) || 0;
		const free = typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : Number(diskInfo.freeGb) || 0;
		const usedPercent = typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : Number(diskInfo.usedPercentage) || 0;
		const freePercent = 100 - usedPercent;

		if (chart) {
			chart.data.datasets[0].data = [used, free];
			chart.update('none');
		} else {
			const diskBarLabelPlugin = {
				id: 'diskBarLabelPlugin',
				afterDatasetsDraw(chart) {
					const ctx = chart.ctx;
					const { chartArea } = chart;
					ctx.save();
					ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
					ctx.fillText(`${usedPercent.toFixed(1)}% Used`, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
					ctx.restore();
				}
			};
			chart = new Chart(chartCanvas, {
				type: 'bar',
				data: {
					labels: ['Disk'],
					datasets: [
						{
							label: m.diskWidget_usedLabel(),
							data: [used],
							backgroundColor: usedPercent > 85 ? 'rgba(239, 68, 68, 0.8)' : usedPercent > 70 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(59, 130, 246, 0.8)',
							borderRadius: 8,
							barPercentage: 1.0,
							categoryPercentage: 1.0,
							stack: 'disk'
						},
						{
							label: m.diskWidget_freeLabel(),
							data: [free],
							backgroundColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)',
							borderRadius: 8,
							barPercentage: 1.0,
							categoryPercentage: 1.0,
							stack: 'disk'
						}
					]
				},
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					animation: {
						duration: 1000,
						easing: 'easeInOutQuart'
					},
					plugins: {
						legend: { display: false },
						tooltip: {
							enabled: true,
							backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
							titleColor: theme === 'dark' ? '#f9fafb' : '#111827',
							bodyColor: theme === 'dark' ? '#d1d5db' : '#374151',
							borderColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.5)',
							borderWidth: 1,
							cornerRadius: 8,
							displayColors: true,
							callbacks: {
								label: function (context) {
									const label = context.dataset.label || '';
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const total = used + free;
									const percentage = total ? (value / total) * 100 : 0;
									return `${label}: ${value.toFixed(1)} GB (${percentage.toFixed(1)}%)`;
								}
							}
						}
					},
					scales: {
						x: {
							stacked: true,
							display: false,
							min: 0,
							max: totalGB
						},
						y: {
							display: false,
							stacked: true
						}
					},
					plugins: [diskBarLabelPlugin]
				}
			});
		}
	});
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/systemInfo?type=disk"
	pollInterval={10000}
	{icon}
	{widgetId}
	{currentSize}
	{availableSizes}
	{onSizeChange}
	{draggable}
	{onDragStart}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		{#if fetchedData?.diskInfo?.root}
			{@const diskInfo = fetchedData.diskInfo.root}
			{@const totalGB = typeof diskInfo.totalGb === 'string' ? parseFloat(diskInfo.totalGb) : diskInfo.totalGb || 0}
			{@const usedGB = typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : diskInfo.usedGb || 0}
			{@const freeGB = typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : diskInfo.freeGb || 0}
			{@const usedPercentage = typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : diskInfo.usedPercentage || 0}
			{@const freePercentage = 100 - usedPercentage}
			{@const usageLevel = usedPercentage > 85 ? 'high' : usedPercentage > 70 ? 'medium' : 'low'}

			<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Disk usage statistics">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<div class="relative">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-full {usageLevel === 'high'
									? 'bg-red-100 dark:bg-red-900/30'
									: usageLevel === 'medium'
										? 'bg-orange-100 dark:bg-orange-900/30'
										: 'bg-blue-100 dark:bg-blue-900/30'}"
								aria-hidden="true"
							>
								<iconify-icon
									icon="mdi:harddisk"
									width="24"
									class={usageLevel === 'high'
										? 'text-red-600 dark:text-red-400'
										: usageLevel === 'medium'
											? 'text-orange-600 dark:text-orange-400'
											: 'text-blue-600 dark:text-blue-400'}
									aria-label="Disk icon"
								></iconify-icon>
							</div>
						</div>
						<div>
							<div class="text-2xl font-bold {theme === 'dark' ? 'text-white' : 'text-gray-900'}" aria-live="polite">
								{usedPercentage.toFixed(1)}%
							</div>
							<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">{m.diskWidget_used()}</div>
						</div>
					</div>
				</div>

				{#if diskInfo}
					<div class="relative flex-shrink-0" style="height: 48px; min-height: 40px; max-height: 60px; width: 100%;">
						<canvas
							bind:this={chartCanvas}
							class="h-full w-full"
							use:updateChartAction={fetchedData}
							style="display: block; width: 100% !important; height: 100% !important;"
							aria-label={m.diskWidget_chartAriaLabel()}
						></canvas>
					</div>
				{/if}

				<div class="flex-shrink-0 space-y-3 pb-6">
					<div
						class="relative h-6 overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}"
						aria-label={m.diskWidget_progressAriaLabel()}
					>
						<div
							class="h-full rounded-full transition-all duration-700 ease-out {usageLevel === 'high'
								? 'bg-gradient-to-r from-red-500 to-red-600'
								: usageLevel === 'medium'
									? 'bg-gradient-to-r from-orange-500 to-red-500'
									: 'bg-gradient-to-r from-blue-500 to-blue-600'}"
							style="width: {usedPercentage}%"
							aria-valuenow={usedPercentage}
							aria-valuemin="0"
							aria-valuemax="100"
							role="progressbar"
						></div>
						<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
							<span class="text-xs font-semibold text-white drop-shadow-sm">
								{m.diskWidget_usedLabel()}: {usedGB.toFixed(1)} GB &nbsp;|&nbsp; {m.diskWidget_freeLabel()}: {freeGB.toFixed(1)} GB
							</span>
						</div>
					</div>

					<div class="grid {currentSize === '1/4' ? 'grid-cols-2' : 'grid-cols-3'} mt-2 gap-3 pb-2 text-xs">
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>{m.diskWidget_total()}</span>
							<span class="font-semibold {theme === 'dark' ? 'text-white' : 'text-gray-900'}">{totalGB.toFixed(1)} GB</span>
						</div>
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>{m.diskWidget_used()}</span>
							<span
								class="font-semibold {usageLevel === 'high'
									? 'text-red-600 dark:text-red-400'
									: usageLevel === 'medium'
										? 'text-orange-600 dark:text-orange-400'
										: 'text-blue-600 dark:text-blue-400'}">{usedGB.toFixed(1)} GB</span
							>
						</div>
						{#if currentSize !== '1/4'}
							<div class="flex flex-col space-y-1">
								<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>{m.diskWidget_free()}</span>
								<span class="font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{freeGB.toFixed(1)} GB</span>
							</div>
						{/if}
					</div>

					{#if currentSize === '1/2' || currentSize === '3/4' || currentSize === 'full'}
						<div class="flex justify-between text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mt-1 px-2 pb-4">
							<span>{m.diskWidget_mount()}: {diskInfo.mountPoint || '/'}</span>
							{#if diskInfo.filesystem}
								<span>{m.diskWidget_filesystem()}: {diskInfo.filesystem}</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{m.diskWidget_loading()}</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">{m.diskWidget_pleaseWait()}</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.flex-shrink-0.space-y-3 {
		padding-bottom: 1.25rem; /* 20px for extra bottom padding */
	}
</style>
