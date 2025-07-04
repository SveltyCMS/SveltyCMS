<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@component
**Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements**

@example
<CPUWidget label="CPU Usage" />

### Features:
- Supports light/dark themes based on global theme settings
- Customizable widget sizes with default and minimum size restrictions
- Accessible by keyboard and screen readers with proper aria-labels
- Responsive and optimized for performance
- Uses efficient data fetching with cache-busting
-->

<script lang="ts">
	// --- Widget Metadata ---
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

	Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

	// Components
	import BaseWidget from '../BaseWidget.svelte';

	// --- Type Definitions ---
	interface HistoricalLoad {
		usage: number[];
		timestamps: string[];
	}

	interface CpuInfo {
		cores: number;
		model: string;
		historicalLoad: HistoricalLoad;
	}

	interface FetchedData {
		cpuInfo: CpuInfo;
	}

	type Size = '1/4' | '1/2' | '3/4' | 'full';

	// --- Component Props ---
	let {
		label = 'CPU Usage',
		theme = 'light',
		icon = 'mdi:cpu-64-bit',
		widgetId = undefined,
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		// FIX: Added types and prefixed unused parameters with an underscore.
		onSizeChange = (_newSize: Size) => {},
		draggable = true,
		onDragStart = (_event: MouseEvent, _item: any, _element: HTMLElement) => {},
		gridCellWidth = 0,
		ROW_HEIGHT = 0,
		GAP_SIZE = 0,
		resizable = true,
		onResizeCommitted = (_spans: { w: number; h: number }) => {},
		onCloseRequest = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		currentSize?: Size;
		availableSizes?: Size[];
		onSizeChange?: (newSize: Size) => void;
		draggable?: boolean;
		onDragStart?: (event: MouseEvent, item: any, element: HTMLElement) => void;
		gridCellWidth?: number;
		ROW_HEIGHT?: number;
		GAP_SIZE?: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
	}>();

	// --- State Management ---
	let currentData = $state<FetchedData | undefined>(undefined);
	let chartInstance = $state<Chart<'line', number[], string> | undefined>(undefined);
	let chartCanvasElement = $state<HTMLCanvasElement | undefined>(undefined);

	/**
	 * A Svelte action to pass data from the child snippet to the parent script.
	 */
	// FIX: Prefixed unused 'canvas' parameter.
	function updateChartAction(_canvas: HTMLCanvasElement, data: FetchedData | undefined) {
		currentData = data;
		return {
			update(newData: FetchedData | undefined) {
				currentData = newData;
			}
		};
	}

	// --- Chart Logic ---
	// This effect handles the creation and updating of the Chart.js instance.
	$effect(() => {
		if (!chartCanvasElement || !currentData?.cpuInfo?.historicalLoad) {
			return;
		}

		const { usage: cpuUsageHistory = [], timestamps: timeStampHistory = [] } = currentData.cpuInfo.historicalLoad;

		const formattedLabels = timeStampHistory.map((ts: string) => {
			try {
				return new Date(ts).toLocaleTimeString();
			} catch (e) {
				console.warn('Invalid timestamp for chart:', ts);
				return 'Invalid Time';
			}
		});

		if (chartInstance) {
			// Update existing chart for smooth transitions
			chartInstance.data.labels = formattedLabels;
			chartInstance.data.datasets[0].data = cpuUsageHistory;

			// Update colors based on theme
			chartInstance.data.datasets[0].borderColor = theme === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)';
			chartInstance.data.datasets[0].backgroundColor = theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)';

			// FIX: Safely access nested chart options using optional chaining (?.)
			if (chartInstance.options.scales?.x?.ticks) {
				chartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
			}
			if (chartInstance.options.scales?.y?.ticks) {
				chartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
			}
			if (chartInstance.options.scales?.x?.grid) {
				chartInstance.options.scales.x.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
			}
			if (chartInstance.options.scales?.y?.grid) {
				chartInstance.options.scales.y.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
			}

			chartInstance.update('none'); // Use 'none' for no animation on data update
		} else {
			// Create a new chart instance
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
								data: cpuUsageHistory,
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
							padding: { top: 10, right: 10, bottom: 10, left: 10 }
						},
						scales: {
							x: {
								display: true,
								ticks: {
									color: theme === 'dark' ? '#9ca3af' : '#6b7280',
									maxTicksLimit: 6,
									autoSkip: true,
									font: { size: 10 }
								},
								grid: {
									display: true,
									color: theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)',
									lineWidth: 1
								},
								border: { display: false }
							},
							y: {
								display: true,
								beginAtZero: true,
								max: 100,
								ticks: {
									color: theme === 'dark' ? '#9ca3af' : '#6b7280',
									stepSize: 25,
									callback: (value) => value + '%',
									font: { size: 10 }
								},
								grid: {
									display: true,
									color: theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)',
									lineWidth: 1
								},
								border: { display: false }
							}
						},
						plugins: {
							legend: { display: false },
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
						}
					}
				});
			} catch (error) {
				console.error('Failed to create chart:', error);
				chartInstance = undefined;
			}
		}
	});

	// --- Lifecycle Hooks ---
	let resizeObserver: ResizeObserver | undefined = undefined;

	onMount(() => {
		const parent = chartCanvasElement?.parentElement?.parentElement;
		if (parent && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => {
				if (chartInstance) chartInstance.resize();
			});
			resizeObserver.observe(parent);
		}
	});

	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = undefined;
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
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
	<!-- FIX: Explicitly typed the 'data' prop from the snippet to resolve 'never' type errors. -->
	{#snippet children({ data: fetchedData }: { data: FetchedData | undefined })}
		{#if fetchedData?.cpuInfo}
			{@const usageArray = fetchedData.cpuInfo.historicalLoad?.usage || []}
			{@const currentUsage = usageArray[usageArray.length - 1] || 0}
			<!-- FIX: Added types to reduce function parameters -->
			{@const averageUsage = usageArray.length > 0 ? usageArray.reduce((a: number, b: number) => a + b, 0) / usageArray.length : 0}
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
						<span class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Current Usage</span>
					</div>
					<div class="text-right">
						<div class="text-sm font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{averageUsage.toFixed(1)}%</div>
						<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Average</div>
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
							aria-label="CPU Usage Chart"
							use:updateChartAction={fetchedData}
							class="h-full w-full"
							style="display: block; width: 100% !important; height: 100% !important;"
						></canvas>
					</div>
				</div>
				{#if currentSize === '1/2' || currentSize === '3/4' || currentSize === 'full'}
					<div class="flex justify-between text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">
						<span>Cores: {fetchedData.cpuInfo.cores || 'N/A'}</span>
						<span>Model: {fetchedData.cpuInfo.model?.split(' ').slice(0, 2).join(' ') || 'Unknown'}</span>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading CPU data</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
