<!--
@file: src/routes/(app)/dashboard/widgets/DiskWidget.svelte
@description: A reusable widget component for displaying disk usage information with improved rendering and error handling.

This widget fetches and displays real-time disk usage data, including:
- Total disk space
- Used disk space
- Free disk space
- Usage percentages

Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging

Usage:
<DiskWidget label="Disk Usage" />
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable, get } from 'svelte/store';
	import Chart from 'chart.js/auto';
	import type { ChartConfiguration, Plugin, ArcElement } from 'chart.js';
	import 'chartjs-adapter-date-fns';

	let { label } = $props();
	export const id: string = crypto.randomUUID();
	export const x: number = 0;
	export const y: number = 0;
	export const w: number = 2;
	export const h: number = 5;
	export const min: { w: number; h: number } = { w: 1, h: 1 };
	export const max: { w: number; h: number } | undefined = { w: 2, h: 5 };
	export const movable: boolean = true;
	export const resizable: boolean = true;

	const diskInfo = writable<{ totalGb: number; usedGb: number; freeGb: number; usedPercentage: number; freePercentage: number }>({
		totalGb: 0,
		usedGb: 0,
		freeGb: 0,
		usedPercentage: 0,
		freePercentage: 0
	});

	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	async function fetchData() {
		try {
			const res = await fetch('/api/systemInfo');
			const data = await res.json();
			diskInfo.set(data.diskInfo);
		} catch (error) {
			console.error('Error fetching disk data:', error);
		}
	}

	const textCenterPlugin: Plugin<'doughnut'> = {
		id: 'textCenterPlugin',
		beforeDraw(chart, args, options) {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const diskInfoValue = get(diskInfo);
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			const formattedTotal = typeof diskInfoValue.totalGb === 'number' ? diskInfoValue.totalGb.toFixed(2) : 'N/A';
			ctx.fillText(`${formattedTotal} GB`, width / 2, height / 2);

			// Draw used and free percentages directly on the chart
			chart.data.datasets[0].data.forEach((value, index) => {
				const percentage = index === 0 ? diskInfoValue.usedPercentage : diskInfoValue.freePercentage;
				const meta = chart.getDatasetMeta(0);
				const arc = meta.data[index] as ArcElement;
				const angle = (arc.startAngle + arc.endAngle) / 2;
				const posX = width / 2 + Math.cos(angle) * (width / 4);
				const posY = height / 2 + Math.sin(angle) * (height / 4);

				// Ensure percentage is a number before calling toFixed()
				const formattedPercentage = typeof percentage === 'number' ? percentage.toFixed(2) : 'N/A';
				ctx.fillText(`${formattedPercentage}%`, posX, posY);
			});

			ctx.restore();
		}
	};

	onMount(async () => {
		await fetchData();
		const { usedGb, freeGb } = get(diskInfo);

		if (chartCanvas) {
			const config: ChartConfiguration<'doughnut', number[], string> = {
				type: 'doughnut',
				data: {
					labels: ['Used', 'Free'],
					datasets: [
						{
							data: [usedGb, freeGb],
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
									const totalGb = dataSet.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
									const percentage = totalGb ? (value / totalGb) * 100 : 0;
									return `${value.toFixed(2)} GB (${percentage.toFixed(2)}%)`;
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

	// Update chart when data changes
	$effect(() => {
		if (chart) {
			const { usedGb, freeGb } = get(diskInfo);
			chart.data.datasets[0].data = [usedGb, freeGb];
			chart.update();
		}
	});
</script>

<!-- Widget UI -->
<div
	class="relative h-full w-full rounded-lg p-4 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-500 dark:text-primary-500"
	aria-label="Disk Usage Widget"
>
	<h2 class="text-center font-bold">Disk Usage</h2>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
	<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
		<p>Total: {typeof $diskInfo.totalGb === 'number' ? $diskInfo.totalGb.toFixed(2) : 'N/A'} GB</p>
		<p>
			Used: {typeof $diskInfo.usedGb === 'number' ? $diskInfo.usedGb.toFixed(2) : 'N/A'} GB ({typeof $diskInfo.usedPercentage === 'number'
				? $diskInfo.usedPercentage.toFixed(2)
				: 'N/A'}%)
		</p>
		<p>
			Free: {typeof $diskInfo.freeGb === 'number' ? $diskInfo.freeGb.toFixed(2) : 'N/A'} GB ({typeof $diskInfo.freePercentage === 'number'
				? $diskInfo.freePercentage.toFixed(2)
				: 'N/A'}%)
		</p>
	</div>
</div>
