<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@component
**Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements**

@example
<CPUWidget label="CPU Usage" />

### Props
- `label`: The label for the widget (default: 'CPU Usage')

### Features:
- Supports light/dark themes based on global theme settings
- Customizable widget sizes with default and minimum size restrictions
- Accessible by keyboard and screen readers with proper aria-labels
- Responsive and optimized for performance
- Uses efficient data fetching with cache-busting
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';
	import { format } from 'date-fns';
	import BaseWidget from '../BaseWidget.svelte';

	let { label = 'CPU Usage', theme = 'light' } = $props();
	const themeType = theme as 'light' | 'dark';

	// Chart state
	let chart = $state<Chart | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);
	let widgetData = $state<any>(undefined);

	// Initialize chart when data and canvas are available
	function initChart() {
		if (!chartCanvas || !widgetData?.cpuInfo) return;

		// Destroy existing chart if it exists
		if (chart) chart.destroy();

		const { cpuUsage = [], timeStamps = [] } = widgetData.cpuInfo;

		// Format timestamps for better display
		const formattedLabels = timeStamps.map((timestamp: string) => {
			const date = new Date(timestamp);
			return format(date, 'HH:mm:ss');
		});

		chart = new Chart(chartCanvas, {
			type: 'line',
			data: {
				labels: formattedLabels,
				datasets: [
					{
						label: 'CPU Usage (%)',
						data: cpuUsage,
						borderColor: themeType === 'dark' ? 'rgba(75, 192, 192, 1)' : 'rgba(54, 162, 235, 1)',
						backgroundColor: themeType === 'dark' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(54, 162, 235, 0.2)',
						fill: true,
						tension: 0.3,
						borderWidth: 2,
						pointRadius: 2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						ticks: {
							color: themeType === 'dark' ? '#fff' : '#666',
							maxTicksLimit: 8,
							maxRotation: 0
						},
						grid: {
							color: themeType === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
						}
					},
					y: {
						beginAtZero: true,
						max: 100,
						ticks: {
							color: themeType === 'dark' ? '#fff' : '#666'
						},
						grid: {
							color: themeType === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
						}
					}
				},
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						mode: 'index',
						intersect: false,
						callbacks: {
							label: (context) => `CPU: ${context.raw}%`
						}
					}
				},
				interaction: {
					mode: 'nearest',
					axis: 'x',
					intersect: false
				},
				animations: {
					tension: {
						duration: 1000,
						easing: 'linear'
					}
				}
			}
		});
	}

	// Update chart when data changes
	$effect(() => {
		if (chart && widgetData?.cpuInfo) {
			const { cpuUsage = [], timeStamps = [] } = widgetData.cpuInfo;

			// Format timestamps
			const formattedLabels = timeStamps.map((timestamp: string) => {
				const date = new Date(timestamp);
				return format(date, 'HH:mm:ss');
			});

			chart.data.labels = formattedLabels;
			chart.data.datasets[0].data = cpuUsage;
			chart.update('none'); // Update without animation for smoother transitions
		}
	});

	// Effect to monitor data and initialize/update chart
	$effect(() => {
		if (chartCanvas && widgetData?.cpuInfo) {
			if (!chart) {
				initChart();
			}
		}
	});

	// Initialize the chart when component mounts and data exists
	onMount(() => {
		if (chartCanvas && widgetData?.cpuInfo) {
			initChart();
		}
	});

	// Clean up chart on component destruction
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget {label} theme={themeType} endpoint="/api/systemInfo" pollInterval={5000} bind:data={widgetData}>
	{#if widgetData?.cpuInfo}
		<div class="flex h-full flex-col">
			<div class="mb-2 flex justify-between text-sm">
				<div>Current: <span class="font-bold">{widgetData.cpuInfo.cpuUsage[widgetData.cpuInfo.cpuUsage.length - 1]?.toFixed(1) || 0}%</span></div>
				<div>
					Average: <span class="font-bold">
						{widgetData.cpuInfo.cpuUsage.length > 0
							? (widgetData.cpuInfo.cpuUsage.reduce((a: number, b: number) => a + b, 0) / widgetData.cpuInfo.cpuUsage.length).toFixed(1)
							: 0}%
					</span>
				</div>
			</div>
			<div class="relative min-h-[150px] flex-grow">
				<canvas bind:this={chartCanvas} aria-label="CPU Usage Chart"></canvas>
			</div>
		</div>
	{:else}
		<div class="flex h-full items-center justify-center">
			<p>Waiting for CPU data...</p>
		</div>
	{/if}
</BaseWidget>
