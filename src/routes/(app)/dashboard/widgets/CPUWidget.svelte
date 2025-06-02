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
	import { onDestroy } from 'svelte'; // untrack can be useful for effects if needed
	import Chart from 'chart.js/auto';
	import 'chartjs-adapter-date-fns'; // Ensure date-fns is installed if you use it for formatting
	// import { format } from 'date-fns'; // Uncomment if you use format

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
	// State for data fetched by BaseWidget
	let fetchedData = $state<any>(undefined); // This will hold { cpuInfo: { ... } }

	// Chart.js instance and canvas element
	let chartInstance = $state<Chart | undefined>(undefined);
	let chartCanvasElement = $state<HTMLCanvasElement | undefined>(undefined);

	// Reactive effect to setup/update the chart when fetchedData or theme changes
	$effect(() => {
		if (!chartCanvasElement) return;

		// Destructure data safely, expecting the structure from your API
		const cpuInfo = fetchedData?.cpuInfo;
		const historicalLoad = cpuInfo?.historicalLoad;
		const currentLoad = cpuInfo?.currentLoad;

		if (!historicalLoad || !Array.isArray(historicalLoad.usage) || !Array.isArray(historicalLoad.timestamps)) {
			// Data not yet available or not in expected format
			if (chartInstance) {
				// Clear chart if data becomes invalid
				chartInstance.data.labels = [];
				chartInstance.data.datasets[0].data = [];
				chartInstance.update('none');
			}
			return;
		}

		const { usage: cpuUsageHistory = [], timestamps: timeStampHistory = [] } = historicalLoad;

		// Format timestamps for chart labels (e.g., HH:mm:ss)
		const formattedLabels = timeStampHistory.map((ts: string) => {
			try {
				return new Date(ts).toLocaleTimeString(); // Or use date-fns: format(new Date(ts), 'HH:mm:ss')
			} catch (e) {
				console.warn('Invalid timestamp for chart:', ts);
				return 'Invalid Time';
			}
		});

		if (chartInstance) {
			// Update existing chart
			chartInstance.data.labels = formattedLabels;
			chartInstance.data.datasets[0].data = cpuUsageHistory;
			// Update colors if theme changed
			chartInstance.data.datasets[0].borderColor = theme === 'dark' ? 'rgba(75, 192, 192, 1)' : 'rgba(54, 162, 235, 1)';
			chartInstance.data.datasets[0].backgroundColor = theme === 'dark' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(54, 162, 235, 0.2)';
			chartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#e5e7eb' : '#4b5563';
			chartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#e5e7eb' : '#4b5563';
			chartInstance.options.scales.x.grid.color = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
			chartInstance.options.scales.y.grid.color = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
			chartInstance.update('none'); // Use 'none' for no animation on data update
		} else {
			// Create new chart instance
			chartInstance = new Chart(chartCanvasElement, {
				type: 'line',
				data: {
					labels: formattedLabels,
					datasets: [
						{
							label: 'CPU Usage (%)',
							data: cpuUsageHistory,
							borderColor: theme === 'dark' ? 'rgba(75, 192, 192, 1)' : 'rgba(54, 162, 235, 1)',
							backgroundColor: theme === 'dark' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(54, 162, 235, 0.2)',
							fill: true,
							tension: 0.3, // Smooth curves
							borderWidth: 1.5,
							pointRadius: 0, // No points for a cleaner look
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
								color: theme === 'dark' ? '#e5e7eb' : '#4b5563', // Tailwind gray-200 / gray-600
								maxTicksLimit: 7, // Limit number of x-axis ticks
								autoSkip: true
							},
							grid: {
								color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
							}
						},
						y: {
							beginAtZero: true,
							max: 100, // CPU percentage
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
					animation: {
						// Subtle animation on initial load
						duration: 400,
						easing: 'easeInOutQuad'
					}
				}
			});
		}
	});

	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = undefined;
		}
	});

	// Helper to get the latest CPU usage value
	let latestCpuValue = $derived(fetchedData?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0]?.toFixed(1) || 'N/A');
	// Helper for average CPU usage
	let averageCpuValue = $derived(() => {
		const usageArray = fetchedData?.cpuInfo?.historicalLoad?.usage;
		if (usageArray && usageArray.length > 0) {
			const sum = usageArray.reduce((a: number, b: number) => a + b, 0);
			return (sum / usageArray.length).toFixed(1);
		}
		return 'N/A';
	});
</script>

<BaseWidget
	{label}
	theme={theme}
	endpoint="/api/systemInfo?type=cpu"
	pollInterval={2000}
	bind:data={fetchedData}
	{icon}
	{widgetId}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#if fetchedData?.cpuInfo}
		<div class="flex h-full flex-col">
			<div class="mb-2 flex items-center justify-between px-1 text-xs text-gray-600 dark:text-gray-400">
				<span>Current: <span class="font-semibold text-gray-800 dark:text-gray-200">{latestCpuValue}%</span></span>
				<span>Average: <span class="font-semibold text-gray-800 dark:text-gray-200">{averageCpuValue}%</span></span>
			</div>
			<div class="relative min-h-[100px] flex-grow">
				<canvas bind:this={chartCanvasElement} aria-label="CPU Usage Chart"></canvas>
			</div>
		</div>
	{:else if !fetchedData}
		<div class="flex h-full flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
			<iconify-icon icon="eos-icons:loading" width="24" class="mb-1"></iconify-icon>
			<span>Loading CPU data...</span>
		</div>
	{/if}
</BaseWidget>
