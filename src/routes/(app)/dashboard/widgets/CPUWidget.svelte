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
	export const widgetMeta = {
		name: 'CPU Usage',
		icon: 'mdi:cpu-64-bit',
		defaultW: 1,
		defaultH: 1,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 }
		]
	};

	import { onDestroy } from 'svelte';
	import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
	import 'chartjs-adapter-date-fns';

	Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

	import BaseWidget from '../BaseWidget.svelte';

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = 'CPU Usage',
		theme = 'light',
		icon = 'mdi:cpu-64-bit',
		widgetId = undefined,
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (spans: { w: number; h: number }) => {},
		onCloseRequest = () => {}
		// initialData is NOT typically passed here, BaseWidget handles fetching
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
	let chartInstance = $state<Chart | undefined>(undefined);
	let chartCanvasElement = $state<HTMLCanvasElement | undefined>(undefined);

	function updateChart(fetchedData: any) {
		if (!chartCanvasElement) return;

		const cpuInfo = fetchedData?.cpuInfo;
		const historicalLoad = cpuInfo?.historicalLoad;
		const currentLoad = cpuInfo?.currentLoad;

		if (!historicalLoad || !Array.isArray(historicalLoad.usage) || !Array.isArray(historicalLoad.timestamps)) {
			if (chartInstance) {
				chartInstance.data.labels = [];
				chartInstance.data.datasets[0].data = [];
				chartInstance.update('none');
			}
			return;
		}

		const { usage: cpuUsageHistory = [], timestamps: timeStampHistory = [] } = historicalLoad;

		const plainCpuUsageHistory = [...cpuUsageHistory];
		const plainTimeStampHistory = [...timeStampHistory];

		const formattedLabels = plainTimeStampHistory.map((ts: string) => {
			try {
				return new Date(ts).toLocaleTimeString();
			} catch (e) {
				console.warn('Invalid timestamp for chart:', ts);
				return 'Invalid Time';
			}
		});

		if (chartInstance) {
			chartInstance.data.labels = formattedLabels;
			chartInstance.data.datasets[0].data = plainCpuUsageHistory;
			// Update colors if theme changed
			chartInstance.data.datasets[0].borderColor = theme === 'dark' ? 'rgba(75, 192, 192, 1)' : 'rgba(54, 162, 235, 1)';
			chartInstance.data.datasets[0].backgroundColor = theme === 'dark' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(54, 162, 235, 0.2)';
			chartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#e5e7eb' : '#4b5563';
			chartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#e5e7eb' : '#4b5563';
			chartInstance.options.scales.x.grid.color = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
			chartInstance.options.scales.y.grid.color = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
			chartInstance.update('none'); // Use 'none' for no animation on data update
		} else {
			// Destroy any existing chart on this canvas first
			const existingChart = Chart.getChart(chartCanvasElement);
			if (existingChart) {
				existingChart.destroy();
			}

			try {
				chartInstance = new Chart(chartCanvasElement, {
					type: 'line',
					data: {
						labels: formattedLabels,
						datasets: [
							{
								label: 'CPU Usage (%)',
								data: plainCpuUsageHistory,
								borderColor: theme === 'dark' ? 'rgba(75, 192, 192, 1)' : 'rgba(54, 162, 235, 1)',
								backgroundColor: theme === 'dark' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(54, 162, 235, 0.2)',
								fill: true,
								tension: 0.3,
								borderWidth: 1.5,
								pointRadius: 0,
								pointHoverRadius: 4
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						scales: {
							x: {
								ticks: {
									color: theme === 'dark' ? '#e5e7eb' : '#4b5563',
									maxTicksLimit: 7,
									autoSkip: true
								},
								grid: {
									color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
								}
							},
							y: {
								beginAtZero: true,
								max: 100,
								ticks: {
									color: theme === 'dark' ? '#e5e7eb' : '#4b5563',
									stepSize: 25
								},
								grid: {
									color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
								}
							}
						},
						plugins: {
							legend: { display: false },
							tooltip: {
								mode: 'index',
								intersect: false,
								callbacks: {
									label: (context) => `CPU: ${parseFloat(context.raw as string).toFixed(1)}%`
								}
							}
						},
						interaction: {
							mode: 'nearest',
							axis: 'x',
							intersect: false
						},
						animation: false
					}
				});
			} catch (error) {
				console.error('Failed to create chart:', error);
				chartInstance = undefined;
			}
		}
	}

	function updateChartAction(canvas: HTMLCanvasElement, data: any) {
		currentData = data;

		return {
			update(newData: any) {
				currentData = newData;
			}
		};
	}

	$effect(() => {
		if (chartCanvasElement && currentData?.cpuInfo) {
			updateChart(currentData);
		}
	});

	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = undefined;
		}
	});
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/systemInfo?type=cpu"
	pollInterval={5000}
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
		{#if fetchedData?.cpuInfo}
			<div class="flex h-full flex-col">
				<div class="mb-2 flex items-center justify-between px-1 text-xs text-gray-600 dark:text-gray-400">
					<span
						>Current: <span class="font-semibold text-gray-800 dark:text-gray-200"
							>{fetchedData?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0]?.toFixed(1) || 'N/A'}%</span
						></span
					>
					<span
						>Average: <span class="font-semibold text-gray-800 dark:text-gray-200"
							>{(() => {
								const usageArray = fetchedData?.cpuInfo?.historicalLoad?.usage;
								if (usageArray && usageArray.length > 0) {
									const sum = usageArray.reduce((a: number, b: number) => a + b, 0);
									return (sum / usageArray.length).toFixed(1);
								}
								return 'N/A';
							})()}%</span
						></span
					>
				</div>
				<div class="relative min-h-[100px] flex-grow">
					<canvas bind:this={chartCanvasElement} aria-label="CPU Usage Chart" use:updateChartAction={fetchedData}></canvas>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
				<iconify-icon icon="eos-icons:loading" width="24" class="mb-1"></iconify-icon>
				<span>Loading CPU data...</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
