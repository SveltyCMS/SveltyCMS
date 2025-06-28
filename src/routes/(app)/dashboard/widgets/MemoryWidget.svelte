<!--
@file src/routes/(app)/dashboard/widgets/MemoryWidget.svelte
@component
**A reusable widget component for displaying memory usage information with improved rendering and error handling**

@example
<MemoryWidget label="Memory Usage" />

### Props
- `label`: The label for the widget (default: 'Memory Usage')

This widget fetches and displays real-time memory usage data, including:
- Total memory
- Used memory
- Free memory
- Usage percentages

Features:
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
		name: 'Memory Usage',
		icon: 'mdi:memory',
		defaultW: 1,
		defaultH: 1,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 }
		]
	};

	import BaseWidget from '../BaseWidget.svelte';
	import { onDestroy } from 'svelte';
	import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
	import type { ChartConfiguration, Plugin } from 'chart.js';

	Chart.register(DoughnutController, ArcElement, Tooltip);

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = 'Memory Usage',
		theme = 'light',
		icon = 'mdi:memory',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (newSize) => {},

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

		// Legacy props
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	let currentData = $state<any>(undefined);
	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	function updateChartAction(canvas: HTMLCanvasElement, data: any) {
		currentData = data;

		return {
			update(newData: any) {
				currentData = newData;
			}
		};
	}

	$effect(() => {
		if (!chartCanvas || !currentData?.memoryInfo?.total) return;

		const { usedMemMb, freeMemMb, usedMemPercentage, freeMemPercentage, totalMemMb } = currentData.memoryInfo.total;

		const plainUsedMem = Number(usedMemMb) || 0;
		const plainFreeMem = Number(freeMemMb) || 0;
		const usedPercent = Number(usedMemPercentage) || 0;
		const freePercent = Number(freeMemPercentage) || 0;
		const totalMem = Number(totalMemMb) || 0;

		if (chart) {
			chart.data.datasets[0].data = [plainUsedMem, plainFreeMem];
			chart.update('none');
		} else {
			const existingChart = Chart.getChart(chartCanvas);
			if (existingChart) {
				existingChart.destroy();
			}

			const memoryTextCenterPlugin: Plugin<'doughnut'> = {
				id: 'memoryTextCenterPlugin',
				beforeDraw(chart) {
					const ctx = chart.ctx;
					const { width, height } = chart;

					ctx.save();
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';

					// Main percentage text
					ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
					ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
					ctx.fillText(`${usedPercent.toFixed(1)}%`, width / 2, height / 2 - 8);

					// Subtitle text
					ctx.font = '12px system-ui, -apple-system, sans-serif';
					ctx.fillStyle = theme === 'dark' ? '#9ca3af' : '#6b7280';
					ctx.fillText('Used', width / 2, height / 2 + 12);

					ctx.restore();
				}
			};

			const config: ChartConfiguration<'doughnut', number[], string> = {
				type: 'doughnut',
				data: {
					labels: ['Used', 'Free'],
					datasets: [
						{
							data: [plainUsedMem, plainFreeMem],
							backgroundColor: [
								usedPercent > 80 ? 'rgba(239, 68, 68, 0.8)' : usedPercent > 60 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(34, 197, 94, 0.8)',
								theme === 'dark' ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)'
							],
							borderColor: [
								usedPercent > 80 ? 'rgba(239, 68, 68, 1)' : usedPercent > 60 ? 'rgba(245, 158, 11, 1)' : 'rgba(34, 197, 94, 1)',
								theme === 'dark' ? 'rgba(75, 85, 99, 0.8)' : 'rgba(229, 231, 235, 1)'
							],
							borderWidth: 2,
							cutout: '75%',
							borderRadius: 4
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					animation: {
						duration: 1000,
						easing: 'easeInOutQuart'
					},
					plugins: {
						legend: {
							display: false
						},
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
									const label = context.label || '';
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const dataSet = context.chart.data.datasets[0].data as number[];
									const totalMemMb = dataSet.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
									const percentage = totalMemMb ? (value / totalMemMb) * 100 : 0;
									return `${label}: ${(value / 1024).toFixed(1)} GB (${percentage.toFixed(1)}%)`;
								}
							}
						}
					}
				},
				plugins: [memoryTextCenterPlugin]
			};
			chart = new Chart(chartCanvas, config);
		}
	});

	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/systemInfo?type=memory"
	pollInterval={10000}
	{icon}
	{widgetId}
	{currentSize}
	{availableSizes}
	{onSizeChange}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData })}
		{#if fetchedData?.memoryInfo?.total}
			{@const totalMemGB = (fetchedData.memoryInfo.total.totalMemMb || 0) / 1024}
			{@const usedMemGB = (fetchedData.memoryInfo.total.usedMemMb || 0) / 1024}
			{@const freeMemGB = (fetchedData.memoryInfo.total.freeMemMb || 0) / 1024}
			{@const usedPercentage = fetchedData.memoryInfo.total.usedMemPercentage || 0}
			{@const usageLevel = usedPercentage > 80 ? 'high' : usedPercentage > 60 ? 'medium' : 'low'}

			<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Memory usage statistics">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<div class="relative">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-full {usageLevel === 'high'
									? 'bg-red-100 dark:bg-red-900/30'
									: usageLevel === 'medium'
										? 'bg-yellow-100 dark:bg-yellow-900/30'
										: 'bg-green-100 dark:bg-green-900/30'}"
								aria-hidden="true"
							>
								<iconify-icon
									icon="mdi:memory"
									width="24"
									class={usageLevel === 'high'
										? 'text-red-600 dark:text-red-400'
										: usageLevel === 'medium'
											? 'text-yellow-600 dark:text-yellow-400'
											: 'text-green-600 dark:text-green-400'}
									aria-label="Memory icon"
								></iconify-icon>
							</div>
						</div>
						<div>
							<div class="text-2xl font-bold {theme === 'dark' ? 'text-white' : 'text-gray-900'}" aria-live="polite">
								{usedPercentage.toFixed(1)}%
							</div>
							<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Memory Used</div>
						</div>
					</div>
				</div>

				<div class="relative flex-shrink-0" style="height: calc({ROW_HEIGHT}px * 0.45); min-height: 80px; max-height: 180px;">
					<canvas
						bind:this={chartCanvas}
						class="h-full w-full"
						use:updateChartAction={fetchedData}
						role="img"
						aria-label="Memory usage doughnut chart"
					></canvas>
				</div>

				<div class="flex-shrink-0 space-y-3">
					<div class="grid {currentSize === '1/4' ? 'grid-cols-2' : 'grid-cols-3'} gap-3 text-xs">
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</span>
							<span class="font-semibold {theme === 'dark' ? 'text-white' : 'text-gray-900'}">{totalMemGB.toFixed(1)} GB</span>
						</div>
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</span>
							<span
								class="font-semibold {usageLevel === 'high'
									? 'text-red-600 dark:text-red-400'
									: usageLevel === 'medium'
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-green-600 dark:text-green-400'}">{usedMemGB.toFixed(1)} GB</span
							>
						</div>
						{#if currentSize !== '1/4'}
							<div class="flex flex-col space-y-1">
								<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Free</span>
								<span class="font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{freeMemGB.toFixed(1)} GB</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden="true"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading memory data</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
