<!--
@file src/routes/	export const widgetMeta = {
		name: 'Disk Usage',
		icon: 'mdi:harddisk',
		defaultSize: { w: 1, h: 2 }
	};/dashboard/widgets/DiskWidget.svelte
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
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Disk Usage',
		icon: 'mdi:disk',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import { BarController, BarElement, CategoryScale, Chart, LinearScale } from 'chart.js';
	import { onDestroy } from 'svelte';
	// Components
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	// Register Chart.js components
	Chart.register(BarController, BarElement, CategoryScale, LinearScale);

	// Type definitions
	interface DiskInfo {
		totalGb: string | number;
		usedGb: string | number;
		freeGb: string | number;
		usedPercentage: string | number;
		mountPoint?: string;
		filesystem?: string;
	}

	interface FetchedData {
		diskInfo?: {
			root?: DiskInfo;
		};
	}

	// Props passed from +page.svelte, then to BaseWidget
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

	let currentData: FetchedData | undefined = $state(undefined);
	let chartCanvas: HTMLCanvasElement | undefined = $state(undefined);
	let chart: Chart | undefined = $state(undefined);

	function updateChartAction(_canvas: HTMLCanvasElement, data: any) {
		currentData = data;

		return {
			update(newData: any) {
				currentData = newData;
			}
		};
	}
	// Move diskInfo extraction to script for chart logic
	let diskInfo: any = undefined;
	let totalGB = 0;
	$effect(() => {
		if (currentData?.diskInfo?.root) {
			diskInfo = currentData.diskInfo.root;
			totalGB = typeof diskInfo.totalGb === 'string' ? parseFloat(diskInfo.totalGb) : diskInfo.totalGb || 0;
		}
	});
	$effect(() => {
		if (!chartCanvas || !diskInfo) {
			return;
		}

		const used = typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : Number(diskInfo.usedGb) || 0;
		const free = typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : Number(diskInfo.freeGb) || 0;
		const usedPercent = typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : Number(diskInfo.usedPercentage) || 0;

		if (chart) {
			chart.data.datasets[0].data = [used];
			chart.data.datasets[1].data = [free];
			chart.update('none');
		} else {
			// Destroy any existing chart on this canvas first
			const existingChart = Chart.getChart(chartCanvas);
			if (existingChart) {
				existingChart.destroy();
			}

			const diskBarLabelPlugin = {
				id: 'diskBarLabelPlugin',
				afterDatasetsDraw(chart: any) {
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
							label: 'Used',
							data: [used],
							backgroundColor: usedPercent > 85 ? 'rgba(239, 68, 68, 0.8)' : usedPercent > 70 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(59, 130, 246, 0.8)',
							borderRadius: 8,
							barPercentage: 1.0,
							categoryPercentage: 1.0,
							stack: 'disk'
						},
						{
							label: 'Free',
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
					}
				},
				plugins: [diskBarLabelPlugin]
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
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
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
				<!-- First Canvas Section with Title and Status Info -->
				<div class="flex-1 space-y-2">
					<!-- Status Info with Color Circle -->
					<div class="flex items-center justify-between px-2">
						<div class="flex items-center space-x-2">
							<div class="relative">
								<div
									class="h-3 w-3 rounded-full {usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}"
								></div>
								<div
									class="absolute inset-0 h-3 w-3 rounded-full text-white dark:text-black {usageLevel === 'high'
										? 'bg-red-500'
										: usageLevel === 'medium'
											? 'bg-yellow-500'
											: 'bg-green-500'} animate-ping opacity-75"
								></div>
							</div>
							<span class="text-sm font-bold">{usedPercentage.toFixed(1)}%</span>
							<span class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Used</span>
						</div>
						<div class="flex gap-2 text-right">
							<div class="text-sm font-semibold">{freePercentage.toFixed(1)}%</div>
							<div class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Free</div>
						</div>
					</div>
					<!-- Disk Usage Overview -->
					<h3 class="text-center text-xs font-semibold">Disk Usage Overview:</h3>

					{#if diskInfo}
						<div class="relative flex-1" style="min-height: 50px; max-height: 65px; width: 100%;">
							<canvas
								bind:this={chartCanvas}
								class="h-full w-full"
								use:updateChartAction={fetchedData}
								style="display: block; width: 100% !important; height: 100% !important;"
								aria-label="Disk usage bar chart"
							></canvas>
						</div>
					{:else}
						<div
							class="relative flex flex-1 items-center justify-center rounded-lg bg-gray-100"
							style="min-height: 50px; max-height: 65px; width: 100%;"
						>
							<span class="text-xs text-gray-500">No disk data</span>
						</div>
					{/if}
				</div>

				<!-- Storage Details Canvas  -->
				<div class="flex-1 space-y-2">
					<h3 class="text-center text-xs font-semibold">Storage Details:</h3>
					<div class="flex flex-1 flex-col space-y-3" style="min-height: 60px; max-height: 80px;">
						<div
							class="relative flex items-center overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}"
							aria-label="Disk usage progress bar"
							style="height: 24px; min-height: 24px;"
						>
							<div
								class="h-full rounded-full transition-all duration-700 ease-out {usageLevel === 'high'
									? 'bg-linear-to-r from-red-500 to-red-600'
									: usageLevel === 'medium'
										? 'bg-linear-to-r from-orange-500 to-red-500'
										: 'bg-linear-to-r from-blue-500 to-blue-600'}"
								style="width: {usedPercentage}%"
								aria-valuenow={usedPercentage}
								aria-valuemin="0"
								aria-valuemax="100"
								role="progressbar"
							></div>
							<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
								<span class="text-xs font-semibold text-white drop-shadow-sm dark:text-black">
									{usedGB.toFixed(1)} GB Used
								</span>
							</div>
						</div>

						<!-- Storage Statistics -->
						<div class="grid {size.w === 1 ? 'grid-cols-2' : 'grid-cols-3'} flex-1 gap-2 text-xs">
							<!-- Total disk space -->
							<div class="flex flex-col space-y-1 text-center">
								<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</span>
								<span class="text-sm font-semibold">{totalGB.toFixed(1)} GB</span>
							</div>

							<!-- Total used disk space -->
							<div class="flex flex-col space-y-1 text-center">
								<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</span>
								<span
									class="text-sm font-semibold {usageLevel === 'high'
										? 'text-red-600 dark:text-red-400'
										: usageLevel === 'medium'
											? 'text-orange-600 dark:text-orange-400'
											: 'text-blue-600 dark:text-blue-400'}"
								>
									{usedGB.toFixed(1)} GB
								</span>
							</div>

							{#if size.w > 1}
								<div class="flex flex-col space-y-1 text-center">
									<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Free</span>
									<span class="font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{freeGB.toFixed(1)} GB</span>
								</div>
							{/if}
						</div>
					</div>
				</div>

				{#if size.w >= 2}
					<div
						class="flex justify-between text-xs {theme === 'dark'
							? 'text-gray-400'
							: 'text-gray-500'} border-t border-gray-200 pt-2 dark:border-gray-700"
					>
						<span>Mount: <span class="font-mono">{diskInfo.mountPoint || '/'}</span></span>
						{#if diskInfo.filesystem}
							<span>FS: <span class="font-mono">{diskInfo.filesystem}</span></span>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading disk data</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
