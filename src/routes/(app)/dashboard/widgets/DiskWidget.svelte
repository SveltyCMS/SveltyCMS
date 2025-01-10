<!--
@file src/routes/(app)/dashboard/widgets/DiskWidget.svelte
@component
**A reusable widget component for displaying disk usage information with improved rendering and error handling**

```ts
<DiskWidget label="Disk Usage" />
```

### Props
- `label`: The label for the widget (default: 'Disk Usage')	

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
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import Chart, { type ChartConfiguration, type Plugin, type ArcElement } from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';
	import BaseWidget from '../BaseWidget.svelte';

	let { label = 'Disk Usage', theme = 'light' } = $props();
	const themeType = theme as 'light' | 'dark';

	// Declare data from BaseWidget slot props
	// @ts-ignore - TypeScript incorrectly flags data as unused
	let data:
		| {
				diskInfo: {
					totalGb: number;
					usedGb: number;
					freeGb: number;
					usedPercentage: number;
					freePercentage: number;
				};
		  }
		| undefined;

	// Chart state
	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	const textCenterPlugin: Plugin<'doughnut'> = {
		id: 'textCenterPlugin',
		beforeDraw(chart) {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const diskInfoValue = data?.diskInfo ?? {
				totalGb: 0,
				usedGb: 0,
				freeGb: 0,
				usedPercentage: 0,
				freePercentage: 0
			};
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			const formattedTotal = typeof diskInfoValue.totalGb === 'number' ? diskInfoValue.totalGb.toFixed(2) : 'N/A';
			ctx.fillText(`${formattedTotal} GB`, width / 2, height / 2);

			// Draw used and free percentages directly on the chart
			chart.data.datasets[0].data.forEach((_, index) => {
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

	// Initialize chart when data is available
	$effect(() => {
		if (chartCanvas && data?.diskInfo) {
			const { usedGb, freeGb } = data.diskInfo;

			const config: ChartConfiguration<'doughnut', number[], string> = {
				type: 'doughnut',
				data: {
					labels: ['Used', 'Free'],
					datasets: [
						{
							data: [usedGb, freeGb],
							backgroundColor: [
								themeType === 'dark' ? 'rgba(255, 99, 132, 0.2)' : 'rgba(255, 99, 132, 0.4)',
								themeType === 'dark' ? 'rgba(54, 162, 235, 0.2)' : 'rgba(54, 162, 235, 0.4)'
							],
							borderColor: [
								themeType === 'dark' ? 'rgba(255, 99, 132, 1)' : 'rgba(255, 99, 132, 0.8)',
								themeType === 'dark' ? 'rgba(54, 162, 235, 1)' : 'rgba(54, 162, 235, 0.8)'
							],
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
									// @ts-ignore - context.label is available but not in types
									const labelText = context.label || '';
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
	});

	// Update chart when data changes
	$effect(() => {
		if (chart && data?.diskInfo) {
			const { usedGb, freeGb } = data.diskInfo;
			chart.data.datasets[0].data = [usedGb, freeGb];
			chart.update();
		}
	});

	// Clean up chart on component destruction
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget {label} theme={themeType} endpoint="/api/systemInfo" pollInterval={5000}>
	<div
		class="relative h-full w-full rounded-lg p-4 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-500 dark:text-primary-500"
		aria-label="Disk Usage Widget"
	>
		<h2 class="text-center font-bold">Disk Usage</h2>
		<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
		<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
			<p>Total: {typeof data?.diskInfo.totalGb === 'number' ? data.diskInfo.totalGb.toFixed(2) : 'N/A'} GB</p>
			<p>
				Used: {typeof data?.diskInfo.usedGb === 'number' ? data.diskInfo.usedGb.toFixed(2) : 'N/A'} GB ({typeof data?.diskInfo.usedPercentage ===
				'number'
					? data.diskInfo.usedPercentage.toFixed(2)
					: 'N/A'}%)
			</p>
			<p>
				Free: {typeof data?.diskInfo.freeGb === 'number' ? data.diskInfo.freeGb.toFixed(2) : 'N/A'} GB ({typeof data?.diskInfo.freePercentage ===
				'number'
					? data.diskInfo.freePercentage.toFixed(2)
					: 'N/A'}%)
			</p>
		</div>
	</div>
</BaseWidget>
