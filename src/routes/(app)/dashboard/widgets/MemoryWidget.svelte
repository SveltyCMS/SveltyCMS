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
		gridCellWidth: number;
		ROW_HEIGHT: number;
		GAP_SIZE: number;
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
					ctx.font = '18px Arial';
					ctx.fillStyle = '#374151';

					const totalMemGb = (totalMem / 1024).toFixed(2);
					ctx.fillText(`${totalMemGb} GB`, width / 2, height / 2);

					const percentages = [usedPercent, freePercent];
					chart.data.datasets[0].data.forEach((value, index) => {
						const percentage = percentages[index];
						const meta = chart.getDatasetMeta(0);
						const arc = meta.data[index] as ArcElement;
						if (arc) {
							const angle = (arc.startAngle + arc.endAngle) / 2;
							const posX = width / 2 + Math.cos(angle) * (width / 4);
							const posY = height / 2 + Math.sin(angle) * (height / 4);
							ctx.fillText(`${percentage.toFixed(1)}%`, posX, posY);
						}
					});
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
							backgroundColor: ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)'],
							borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)'],
							borderWidth: 2
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					animation: false,
					plugins: {
						tooltip: {
							callbacks: {
								label: function (context) {
									const label = context.label || '';
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const dataSet = context.chart.data.datasets[0].data as number[];
									const totalMemMb = dataSet.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
									const percentage = totalMemMb ? (value / totalMemMb) * 100 : 0;
									return `${label}: ${(value / 1024).toFixed(2)} GB (${percentage.toFixed(2)}%)`;
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
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData })}
		<div
			class="relative h-full w-full rounded-lg bg-surface-50 p-2 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-400 dark:text-primary-500"
			aria-label="Memory Usage Widget"
		>
			<h2 class="flex items-center justify-center gap-2 text-center font-bold">
				<iconify-icon icon="mdi:memory" width="20" class="text-primary-500"></iconify-icon>
				Memory Usage
			</h2>
			<canvas bind:this={chartCanvas} class="h-full w-full p-2" use:updateChartAction={fetchedData}></canvas>
			{#if fetchedData?.memoryInfo?.total}
				<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
					<p>Total: {((fetchedData.memoryInfo.total.totalMemMb || 0) / 1024).toFixed(2)} GB</p>
					<p>
						Used: {((fetchedData.memoryInfo.total.usedMemMb || 0) / 1024).toFixed(2)} GB ({(
							fetchedData.memoryInfo.total.usedMemPercentage || 0
						).toFixed(2)}%)
					</p>
					<p>
						Free: {((fetchedData.memoryInfo.total.freeMemMb || 0) / 1024).toFixed(2)} GB ({(
							fetchedData.memoryInfo.total.freeMemPercentage || 0
						).toFixed(2)}%)
					</p>
				</div>
			{:else}
				<p class="text-center text-gray-500">No memory data available</p>
			{/if}
		</div>
	{/snippet}
</BaseWidget>
