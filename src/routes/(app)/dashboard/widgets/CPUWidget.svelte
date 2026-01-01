<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@component
**Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements**

@example
<CPUWidget label="CPU Usage" size={{ w: 1, h: 1 }} />

### Props
- `label`: The label for the widget (default: 'CPU Usage')
- `size`: Widget size in columns and rows (e.g., `{ w: 1, h: 1 }`)

### Features:
- Supports light/dark themes
- Fully responsive to width and height changes
- Accessible by keyboard and screen readers
- Optimized Chart.js integration
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'CPU Usage',
		icon: 'mdi:cpu-64-bit',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
	import 'chartjs-adapter-date-fns';
	import { onDestroy, onMount } from 'svelte';
	import BaseWidget from '../BaseWidget.svelte';
	import type { WidgetSize } from '@src/content/types';

	// Register Chart.js components
	Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

	const {
		label = 'CPU Usage',
		theme = 'light',
		icon = 'mdi:cpu-64-bit',
		widgetId = undefined,
		size = { w: 1, h: 1 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	let currentData: any = $state(undefined);
	let chartInstance: Chart | undefined = $state(undefined);
	let chartCanvasElement: HTMLCanvasElement | undefined = $state(undefined);

	function updateChart(fetchedData: any) {
		if (!chartCanvasElement) return;
		const cpuInfo = fetchedData?.cpuInfo;
		const historicalLoad = cpuInfo?.historicalLoad;
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
			} catch {
				return 'Invalid Time';
			}
		});

		const fontSize = size.w >= 3 || size.h >= 2 ? 12 : 10;
		const maxTicks = size.w >= 3 ? 8 : 6;

		if (chartInstance) {
			chartInstance.data.labels = formattedLabels;
			chartInstance.data.datasets[0].data = plainCpuUsageHistory;
			chartInstance.data.datasets[0].borderColor = theme === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)';
			chartInstance.data.datasets[0].backgroundColor = theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)';

			// Safely update chart options with null checks
			if (chartInstance.options.scales?.x?.ticks) {
				chartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
				chartInstance.options.scales.x.ticks.font = { size: fontSize };
				chartInstance.options.scales.x.ticks.maxTicksLimit = maxTicks;
			}
			if (chartInstance.options.scales?.y?.ticks) {
				chartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#9ca3af' : '#6b7280';
				chartInstance.options.scales.y.ticks.font = { size: fontSize };
			}
			if (chartInstance.options.scales?.x?.grid) {
				chartInstance.options.scales.x.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
			}
			if (chartInstance.options.scales?.y?.grid) {
				chartInstance.options.scales.y.grid.color = theme === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)';
			}

			chartInstance.update('none');
		} else {
			const existingChart = Chart.getChart(chartCanvasElement);
			if (existingChart) existingChart.destroy();

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
						padding: { top: 10, right: 10, bottom: 10, left: 10 }
					},
					scales: {
						x: {
							display: true,
							ticks: {
								color: theme === 'dark' ? '#9ca3af' : '#6b7280',
								maxTicksLimit: maxTicks,
								autoSkip: true,
								font: { size: fontSize }
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
								font: { size: fontSize }
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
		}
	}

	function updateChartAction(_canvas: HTMLCanvasElement, data: any) {
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

	let resizeObserver: ResizeObserver | undefined;

	onMount(() => {
		if (chartCanvasElement && chartInstance) {
			chartInstance.resize();
		}
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
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data: fetchedData })}
		{#if fetchedData?.cpuInfo}
			{@const currentUsage = Number(fetchedData?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0] || 0)}
			{@const usageArray = fetchedData?.cpuInfo?.historicalLoad?.usage || []}
			{@const averageUsage = usageArray.length > 0 ? Number(usageArray.reduce((a: number, b: number) => a + b, 0) / usageArray.length) : 0}
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
							<span class="text-sm font-bold">{currentUsage.toFixed(1)}%</span>
							<span class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Current Usage</span>
						</div>
					</div>
					<div class="flex items-center gap-2 text-right">
						<div class="text-sm font-semibold">{averageUsage.toFixed(1)}%</div>
						<div class="text-sm {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Average</div>
					</div>
				</div>
				<div class="space-y-2">
					<div class="relative h-2 overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}">
						<div
							class="h-full rounded-full transition-all duration-700 ease-out {usageLevel === 'high'
								? 'bg-linear-to-r from-red-500 to-red-600'
								: usageLevel === 'medium'
									? 'bg-linear-to-r from-yellow-500 to-orange-500'
									: 'bg-linear-to-r from-blue-500 to-blue-600'}"
							style="width: {currentUsage}%"
						></div>
						<div class="absolute inset-0 h-full w-full animate-pulse bg-linear-to-r from-transparent via-white to-transparent opacity-20"></div>
					</div>
				</div>
				<div class="relative grow rounded-lg" style="min-height: {size.h >= 2 ? '150px' : '120px'}; height: 100%;">
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
				{#if size.w >= 2 || size.h >= 2}
					<div class="flex justify-between px-2 text-xs {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">
						<span>
							Cores: <span class="font-bold {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}"
								>{fetchedData?.cpuInfo?.cores?.count || 'N/A'}</span
							>
						</span>
						<span>
							Model: <span class="font-bold {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}"
								>{fetchedData?.cpuInfo?.cores?.perCore?.[0]?.model?.split(' ').slice(0, 2).join(' ') || 'Unknown'}</span
							>
						</span>
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
