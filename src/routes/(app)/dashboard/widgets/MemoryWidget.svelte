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

	let { label = 'Memory Usage', theme = 'light', icon = 'mdi:memory' } = $props();

	// Chart state
	let data: any = $state(undefined);
	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	const textCenterPlugin: Plugin<'doughnut'> = {
		id: 'textCenterPlugin',
		beforeDraw(chart) {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const memoryInfoValue = data?.memoryInfo ?? {
				totalMemMb: 0,
				usedMemMb: 0,
				freeMemMb: 0,
				usedMemPercentage: 0,
				freeMemPercentage: 0
			};
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			ctx.fillText(`${(memoryInfoValue.totalMemMb / 1024).toFixed(2)} GB`, width / 2, height / 2);

			// Draw used and free percentages directly on the chart
			chart.data.datasets[0].data.forEach((value, index) => {
				const percentage = index === 0 ? memoryInfoValue.usedMemPercentage : memoryInfoValue.freeMemPercentage;
				const meta = chart.getDatasetMeta(0);
				const arc = meta.data[index] as ArcElement;
				const angle = (arc.startAngle + arc.endAngle) / 2;
				const posX = width / 2 + Math.cos(angle) * (width / 4);
				const posY = height / 2 + Math.sin(angle) * (height / 4);
				ctx.fillText(`${percentage.toFixed(2)}%`, posX, posY);
			});
			ctx.restore();
		}
	};

	$effect(() => {
		if (chartCanvas && data?.memoryInfo) {
			const { usedMemMb, freeMemMb } = data.memoryInfo;
			const config: ChartConfiguration<'doughnut', number[], string> = {
				type: 'doughnut',
				data: {
					labels: ['Used', 'Free'],
					datasets: [
						{
							data: [usedMemMb, freeMemMb],
							backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)'],
							borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)'],
							borderWidth: 1
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						tooltip: {
							callbacks: {
								label: function (context) {
									const label = context.label || '';
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const dataSet = context.chart.data.datasets[0].data as number[];
									const totalMemMb = dataSet.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
									const percentage = totalMemMb ? (value / totalMemMb) * 100 : 0;
									return `${(value / 1024).toFixed(2)} GB (${percentage.toFixed(2)}%)`;
								}
							}
						}
					}
				},
				plugins: [textCenterPlugin]
			};
			chart = new Chart(chartCanvas, config);
		}
	});

	// Update chart when memory data changes
	$effect(() => {
		if (chart && data?.memoryInfo) {
			const { usedMemMb, freeMemMb } = data.memoryInfo;
			chart.data.datasets[0].data = [usedMemMb, freeMemMb];
			chart.update();
		}
	});

	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget {label} {theme} endpoint="/api/systemInfo?type=memory" pollInterval={5000} bind:data {icon}>
	<div
		class="relative h-full w-full rounded-lg bg-surface-50 p-2 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-400 dark:text-primary-500"
		aria-label="Memory Usage Widget"
	>
		<h2 class="flex items-center justify-center gap-2 text-center font-bold">
			<iconify-icon icon="mdi:memory" width="20" class="text-primary-500"></iconify-icon>
			Memory Usage
		</h2>
		<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
		{#if data?.memoryInfo}
			<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
				<p>Total: {(data.memoryInfo.totalMemMb / 1024).toFixed(2)} GB</p>
				<p>
					Used: {(data.memoryInfo.usedMemMb / 1024).toFixed(2)} GB ({data.memoryInfo.usedMemPercentage}%)
				</p>
				<p>
					Free: {(data.memoryInfo.freeMemMb / 1024).toFixed(2)} GB ({data.memoryInfo.freeMemPercentage}%)
				</p>
			</div>
		{:else}
			<p class="text-center text-gray-500">No memory data available</p>
		{/if}
	</div>
</BaseWidget>
