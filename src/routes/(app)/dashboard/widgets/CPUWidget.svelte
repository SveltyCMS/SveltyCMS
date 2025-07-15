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

	import { onDestroy, onMount } from 'svelte';
	import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
	import 'chartjs-adapter-date-fns';
	import { getLocale } from '@src/paraglide/runtime';
	import { m } from '@src/paraglide/messages';

	Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

	import BaseWidget from '../BaseWidget.svelte';

	// Props passed from +page.svelte, then to BaseWidget
	let {
		label = m.cpuWidget_label(),
		theme = 'light',
		icon = 'mdi:cpu-64-bit',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (newSize) => {},

		// Drag props
		draggable = true,
		onDragStart = (event, item, element) => {},

		// Legacy props (keeping for compatibility)
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

		// New sizing props
		currentSize?: '1/4' | '1/2' | '3/4' | 'full';
		availableSizes?: ('1/4' | '1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;

		// Drag props
		draggable?: boolean;
		onDragStart?: (event: MouseEvent, item: any, element: HTMLElement) => void;

		// Legacy props
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	let currentData = $state<any>(undefined);
	let chartInstance = $state<Chart | undefined>(undefined);
	let chartCanvasElement = $state<HTMLCanvasElement | undefined>(undefined);
	let _languageTag = $state(getLocale());

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
			chartInstance.data.datasets[0].borderColor = theme === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)';
			chartInstance.data.datasets[0].backgroundColor = theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)';
			chartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
			chartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
			chartInstance.options.scales.x.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
			chartInstance.options.scales.y.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
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
								borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)',
								backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)',
								fill: true,
								tension: 0.4,
								borderWidth: 2,
								pointRadius: 0,
								pointHoverRadius: 5,
								pointBackgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)',
								pointBorderColor: theme === 'dark' ? '#1f2937' : '#ffffff',
								pointBorderWidth: 2
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						layout: {
							padding: {
								top: 10,
								right: 10,
								bottom: 10,
								left: 10
							}
						},
						scales: {
							x: {
								display: true,
								ticks: {
									color: theme === 'dark' ? '#9ca3af' : '#6b7280',
									maxTicksLimit: 6,
									autoSkip: true,
									font: {
										size: 10
									}
								},
								grid: {
									display: true,
									color: theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)',
									lineWidth: 1
								},
								border: {
									display: false
								}
							},
							y: {
								display: true,
								beginAtZero: true,
								max: 100,
								ticks: {
									color: theme === 'dark' ? '#9ca3af' : '#6b7280',
									stepSize: 25,
									callback: (value) => value + '%',
									font: {
										size: 10
									}
								},
								grid: {
									display: true,
									color: theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)',
									lineWidth: 1
								},
								border: {
									display: false
								}
							}
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
								borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.5)' : 'rgba(59, 130, 246, 0.5)',
								borderWidth: 1,
								cornerRadius: 8,
								displayColors: false,
								callbacks: {
									title: (context) => context[0].label,
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
							duration: 750,
							easing: 'easeInOutQuart'
						}
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

	let resizeObserver: ResizeObserver | undefined = undefined;

	onMount(() => {
		if (chartCanvasElement && chartInstance) {
			chartInstance.resize();
		}
		// Observe parent for size changes
		const parent = chartCanvasElement?.parentElement?.parentElement;
		if (parent && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => {
				if (chartInstance) chartInstance.resize();
			});
			resizeObserver.observe(parent);
		}
		return () => {
			if (resizeObserver && parent) resizeObserver.disconnect();
		};
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
	endpoint="/api/dashboard/systemInfo?type=cpu"
	pollInterval={5000}
	{icon}
	{widgetId}
	{currentSize}
	{availableSizes}
	{onSizeChange}
	{draggable}
	{onDragStart}
	{gridCellWidth}
	{ROW_HEIGHT}
	{GAP_SIZE}
	{resizable}
	{onResizeCommitted}
	{onCloseRequest}
>
	{#snippet children({ data: fetchedData })}
		{#if fetchedData?.cpuInfo}
			{@const currentUsage = fetchedData?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0] || 0}
			{@const usageArray = fetchedData?.cpuInfo?.historicalLoad?.usage || []}
			{@const averageUsage = usageArray.length > 0 ? usageArray.reduce((a, b) => a + b, 0) / usageArray.length : 0}
			{@const usageLevel = currentUsage > 80 ? 'high' : currentUsage > 50 ? 'medium' : 'low'}

			<div class="flex h-full flex-col space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex flex-col space-y-1">
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
							<span class="text-lg font-bold {theme === 'dark' ? 'text-white' : 'text-gray-900'}">{currentUsage.toFixed(1)}%</span>
						</div>
						<span class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">{m.cpuWidget_currentUsage()}</span>
					</div>
					<div class="text-right">
						<div class="text-sm font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{averageUsage.toFixed(1)}%</div>
						<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">{m.cpuWidget_average()}</div>
					</div>
				</div>
				<div class="space-y-2">
					<div class="relative h-2 overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}">
						<div
							class="h-full rounded-full transition-all duration-700 ease-out {usageLevel === 'high'
								? 'bg-gradient-to-r from-red-500 to-red-600'
								: usageLevel === 'medium'
									? 'bg-gradient-to-r from-yellow-500 to-orange-500'
									: 'bg-gradient-to-r from-blue-500 to-blue-600'}"
							style="width: {currentUsage}%"
						></div>
						<div class="absolute inset-0 h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white to-transparent opacity-20"></div>
					</div>
				</div>
				<div class="relative flex-grow rounded-lg {theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'} p-3" style="min-height: 120px; height: 100%;">
					<div class="relative h-full w-full">
						<canvas
							bind:this={chartCanvasElement}
							aria-label={m.cpuWidget_chartAriaLabel()}
							use:updateChartAction={fetchedData}
							class="h-full w-full"
							style="display: block; width: 100% !important; height: 100% !important;"
						></canvas>
					</div>
				</div>
				<div class="flex justify-between text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">
					<span>{m.cpuWidget_cores({count: fetchedData?.cpuInfo?.cores?.count || 'N/A'})}</span>
					<span>{m.cpuWidget_model({model: fetchedData?.cpuInfo?.cores?.perCore?.[0]?.model?.split(' ').slice(0, 2).join(' ') || 'Unknown'})}</span>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{m.cpuWidget_loading()}</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">{m.cpuWidget_pleaseWait()}</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
