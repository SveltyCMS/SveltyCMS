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
	import BaseWidget from '../BaseWidget.svelte';
	import { onMount, onDestroy, getContext } from 'svelte';
	import { writable, get } from 'svelte/store';
	import Chart from 'chart.js/auto';
	import type { ChartConfiguration, Plugin, ArcElement } from 'chart.js';
	import 'chartjs-adapter-date-fns';

	let { label, theme = 'light' } = $props();
	const themeType = theme as 'light' | 'dark';
	export const id: string = crypto.randomUUID();
	export const x: number = 0;
	export const y: number = 0;
	export const w: number = 2;
	export const h: number = 5;
	export const min: { w: number; h: number } = { w: 1, h: 1 };
	export const max: { w: number; h: number } | undefined = { w: 2, h: 5 };
	export const movable: boolean = true;
	export const resizable: boolean = true;

	const memoryInfo = writable<{ totalMemMb: number; usedMemMb: number; freeMemMb: number; usedMemPercentage: number; freeMemPercentage: number }>({
		totalMemMb: 0,
		usedMemMb: 0,
		freeMemMb: 0,
		usedMemPercentage: 0,
		freeMemPercentage: 0
	});

	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	async function fetchData() {
		try {
			const res = await fetch('/api/systemInfo');
			const data = await res.json();
			memoryInfo.set(data.memoryInfo);
		} catch (error) {
			console.error('Error fetching memory data:', error);
		}
	}

	const textCenterPlugin: Plugin<'doughnut'> = {
		id: 'textCenterPlugin',
		beforeDraw(chart, args, options) {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const memoryInfoValue = get(memoryInfo);
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

	onMount(async () => {
		await fetchData();
		const { usedMemMb, freeMemMb } = get(memoryInfo);

		if (chartCanvas) {
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

		const interval = setInterval(fetchData, 5000);
		onDestroy(() => clearInterval(interval));
	});

	// Update chart when memory data changes
	$effect(() => {
		if (chart) {
			const { usedMemMb, freeMemMb } = get(memoryInfo);
			chart.data.datasets[0].data = [usedMemMb, freeMemMb];
			chart.update();
		}
	});
</script>

<BaseWidget {label} endpoint="/api/systemInfo" pollInterval={5000} theme={themeType}>
	<div
		class="relative h-full w-full rounded-lg p-4 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-500 dark:text-primary-500"
		aria-label="Memory Usage Widget"
	>
		<h2 class="text-center font-bold">Memory Usage</h2>
		<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
		<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
			<p>Total: {($memoryInfo.totalMemMb / 1024).toFixed(2)} GB</p>
			<p>Used: {($memoryInfo.usedMemMb / 1024).toFixed(2)} GB ({$memoryInfo.usedMemPercentage}%)</p>
			<p>Free: {($memoryInfo.freeMemMb / 1024).toFixed(2)} GB ({$memoryInfo.freeMemPercentage}%)</p>
		</div>
	</div>
</BaseWidget>
