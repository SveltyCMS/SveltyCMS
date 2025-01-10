<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@component
**Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements**

```tsx
<CPUWidget label="CPU Usage" />
```

### Props
- `label`: The label for the widget (default: 'CPU Usage')

Features:
- Supports light/dark themes based on global theme settings
- Customizable widget sizes with default and minimum size restrictions
- Accessible by keyboard and screen readers with proper aria-labels
- Responsive and optimized for performance
- Uses efficient data fetching with cache-busting
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import Chart, { type ChartConfiguration } from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';
	import BaseWidget from '../BaseWidget.svelte';

	let { label = 'CPU Usage', theme = 'light' } = $props();
	const themeType = theme as 'light' | 'dark';

	// Chart state
	let chart = $state<Chart | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	let data:
		| {
				cpuInfo: {
					cpuUsage: number[];
					timeStamps: string[];
				};
		  }
		| undefined;

	// Initialize chart when data is available
	$effect(() => {
		if (chartCanvas && data?.cpuInfo) {
			const { cpuUsage, timeStamps } = data.cpuInfo;

			const config: ChartConfiguration<'line', number[], string> = {
				type: 'line',
				data: {
					labels: timeStamps,
					datasets: [
						{
							label: 'CPU Usage (%)',
							data: cpuUsage,
							borderColor: themeType === 'dark' ? 'rgb(var(--color-primary-500))' : 'rgb(var(--color-primary-600))',
							backgroundColor: themeType === 'dark' ? 'rgba(var(--color-primary-500), 0.2)' : 'rgba(var(--color-primary-600), 0.2)',
							fill: true,
							borderWidth: 2,
							pointRadius: 3
						}
					]
				},
				options: {
					scales: {
						x: {
							type: 'time',
							time: {
								unit: 'second'
							},
							grid: {
								color: themeType === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
							}
						},
						y: {
							beginAtZero: true,
							max: 100,
							grid: {
								color: themeType === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
							}
						}
					},
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						tooltip: {
							callbacks: {
								label: (context) => `Usage: ${context.raw}%`
							}
						},
						legend: {
							display: false
						}
					}
				}
			};

			chart = new Chart(chartCanvas, config);
		}
	});

	// Update chart when data changes
	$effect(() => {
		if (chart && data?.cpuInfo) {
			const { cpuUsage, timeStamps } = data.cpuInfo;
			chart.data.labels = timeStamps;
			chart.data.datasets[0].data = cpuUsage;
			chart.update();
		}
	});

	// Clean up chart on component destruction
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget {label} theme={themeType} endpoint="/api/systemInfo" pollInterval={5000}>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2" aria-label="CPU Usage Chart"></canvas>
</BaseWidget>
