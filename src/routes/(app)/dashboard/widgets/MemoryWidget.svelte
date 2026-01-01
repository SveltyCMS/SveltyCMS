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
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Memory Usage',
		icon: 'mdi:memory',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import type { ChartConfiguration, Plugin } from 'chart.js';
	import { ArcElement, Chart, PieController, Tooltip } from 'chart.js';
	import { onDestroy } from 'svelte';
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	Chart.register(PieController, ArcElement, Tooltip);

	interface MemoryData {
		memoryInfo: {
			total: {
				usedMemMb: number;
				freeMemMb: number;
				usedMemPercentage: number;
			};
		};
	}

	// Props passed from +page.svelte, then to BaseWidget
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

	let currentData: MemoryData | undefined = $state(undefined);
	let chart: Chart | undefined = $state(undefined);
	let chartCanvas: HTMLCanvasElement | undefined = $state(undefined);

	function updateChartAction(_canvas: HTMLCanvasElement, data: any) {
		currentData = data;

		return {
			update(newData: any) {
				currentData = newData;
			}
		};
	}

	$effect(() => {
		if (!chartCanvas || !currentData?.memoryInfo?.total) return;

		// Data is already in MB from API
		const usedMemMb = currentData.memoryInfo.total.usedMemMb || 0;
		const freeMemMb = currentData.memoryInfo.total.freeMemMb || 0;
		const usedPercent = currentData.memoryInfo.total.usedMemPercentage || 0;

		const plainUsedMem = Number(usedMemMb) || 0;
		const plainFreeMem = Number(freeMemMb) || 0;

		if (chart) {
			chart.data.datasets[0].data = [plainUsedMem, plainFreeMem];
			chart.update('none');
		} else {
			const existingChart = Chart.getChart(chartCanvas);
			if (existingChart) {
				existingChart.destroy();
			}

			const memoryTextCenterPlugin: Plugin = {
				id: 'memoryTextCenterPlugin',
				beforeDraw(chart) {
					const ctx = chart.ctx;
					const { width, height } = chart;

					ctx.save();
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';

					// Main percentage text
					ctx.font = `bold ${size.w > 1 ? '20px' : '16px'} system-ui, -apple-system, sans-serif`;
					ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
					ctx.fillText(`${usedPercent.toFixed(1)}%`, width / 2, height / 2 - 8);

					// Subtitle text
					ctx.font = `${size.w > 1 ? '12px' : '10px'} system-ui, -apple-system, sans-serif`;
					ctx.fillStyle = theme === 'dark' ? '#9ca3af' : '#6b7280';
					ctx.fillText('Used', width / 2, height / 2 + 12);

					ctx.restore();
				}
			};

			const config: ChartConfiguration = {
				type: 'pie',
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
	endpoint="/api/dashboard/systemInfo?type=memory"
	pollInterval={10000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData }: { data: any | undefined })}
		{#if fetchedData?.memoryInfo?.total}
			{@const totalMemGB = (fetchedData.memoryInfo.total.totalMemMb || 0) / 1024}
			{@const usedMemGB = (fetchedData.memoryInfo.total.usedMemMb || 0) / 1024}
			{@const freeMemGB = (fetchedData.memoryInfo.total.freeMemMb || 0) / 1024}
			{@const usedPercentage = fetchedData.memoryInfo.total.usedMemPercentage || 0}
			{@const usageLevel = usedPercentage > 80 ? 'high' : usedPercentage > 60 ? 'medium' : 'low'}
			{@const freePercentage = 100 - usedPercentage}

			<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Memory usage statistics">
				<div class="flex items-center space-x-3">
					<div class="flex items-center space-x-2">
						<div class="relative">
							<div
								class="h-3 w-3 rounded-full {usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}"
							></div>
							<div
								class="absolute inset-0 h-3 w-3 rounded-full {usageLevel === 'high'
									? 'bg-red-500'
									: usageLevel === 'medium'
										? 'bg-yellow-500'
										: 'bg-green-500'} animate-ping opacity-75"
							></div>
						</div>

						<div class="flex w-full items-center justify-between">
							<div class="flex gap-2">
								<div class="text-sm font-bold" aria-live="polite">{usedPercentage.toFixed(1)}%</div>
								<div class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Memory Used</div>
							</div>
							<div class="flex gap-2">
								<div class="text-sm font-bold" aria-live="polite">{freePercentage.toFixed(1)}%</div>
								<div class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Memory Free</div>
							</div>
						</div>
					</div>
				</div>

				<h3 class="text-xs font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} text-center">Memory Usage Overview</h3>
				<div class="relative shrink-0" style="height: 120px; min-height: 80px; max-height: 180px; width: 100%;">
					<canvas
						bind:this={chartCanvas}
						class="h-full w-full"
						use:updateChartAction={fetchedData}
						style="display: block; width: 100% !important; height: 100% !important;"
						aria-label="Memory usage pie chart"
					></canvas>
				</div>

				<h3 class="text-xs font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} text-center">Memory Statistics</h3>
				<div class="shrink-0 space-y-3">
					<div class="grid {size.w === 1 ? 'grid-cols-2' : 'grid-cols-3'} gap-3 text-xs">
						<div class="flex flex-col text-center">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</span>
							<span class="text-sm font-semibold">{totalMemGB.toFixed(1)} GB</span>
						</div>
						<div class="flex flex-col text-center">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</span>
							<span
								class="text-sm font-semibold {usageLevel === 'high'
									? 'text-red-600 dark:text-red-400'
									: usageLevel === 'medium'
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-green-600 dark:text-green-400'}">{usedMemGB.toFixed(1)} GB</span
							>
						</div>

						{#if size.w !== 1}
							<div class="flex flex-col space-y-1 text-center">
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
					<div class="text-xs">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
