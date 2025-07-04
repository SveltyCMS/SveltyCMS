<!--
@file src/routes/(app)/dashboard/widgets/DiskWidget.svelte
@component
**A reusable widget component for displaying disk usage information with improved rendering and error handling**

@example
<DiskWidget label="Disk Usage" />

### Props
- `label`: The label for the widget (default: 'Disk Usage')

This widget fetches and displays real-time disk usage data, including:
- Total disk space
- Used disk space
- Free disk space
- Usage percentages

### Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging
-->

<script lang="ts">
	// Metadata for the dashboard grid system
	export const widgetMeta = {
		name: 'Disk Usage',
		icon: 'mdi:harddisk',
		defaultW: 1,
		defaultH: 1,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 }
		]
	};

	import { onDestroy } from 'svelte';
	import { Chart, BarController, BarElement, Tooltip, CategoryScale, LinearScale } from 'chart.js';
	Chart.register(BarController, BarElement, Tooltip, CategoryScale, LinearScale);

	// Components
	import BaseWidget from '../BaseWidget.svelte';

	// --- Type Definitions ---
	// Defines the structure of the disk information object for strong type safety.
	interface DiskInfo {
		totalGb: number | string;
		usedGb: number | string;
		freeGb: number | string;
		usedPercentage: number | string;
		mountPoint?: string;
		filesystem?: string;
	}

	// Defines the shape of the data fetched from the API endpoint.
	type FetchedData = {
		diskInfo: {
			root: DiskInfo;
		};
	};

	// Type alias for widget size options for cleaner code.
	type Size = '1/4' | '1/2' | '3/4' | 'full';

	// --- Component Props ---
	let {
		label = 'Disk Usage',
		theme = 'light',
		icon = 'mdi:harddisk',
		widgetId = undefined,

		// New sizing props
		currentSize = '1/4',
		availableSizes = ['1/4', '1/2', '3/4', 'full'],
		onSizeChange = (_newSize: Size) => {},
		// Drag props
		draggable = true,
		onDragStart = (_event: MouseEvent, _item: any, _element: HTMLElement) => {},
		// Legacy props
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
		// New sizing props
		currentSize?: Size;
		availableSizes?: Size[];
		onSizeChange?: (newSize: Size) => void;
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

	// --- State Management ---
	let currentData = $state<FetchedData | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);
	let chart = $state<Chart<'bar', number[], string> | undefined>(undefined);

	function updateChartAction(_canvas: HTMLCanvasElement, data: FetchedData | undefined) {
		currentData = data;
		return {
			update(newData: FetchedData | undefined) {
				currentData = newData;
			}
		};
	}

	// --- Derived State for UI and Chart ---
	const diskInfo = $derived(currentData?.diskInfo?.root);
	const totalGB = $derived(diskInfo ? (typeof diskInfo.totalGb === 'string' ? parseFloat(diskInfo.totalGb) : diskInfo.totalGb || 0) : 0);
	const usedGB = $derived(diskInfo ? (typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : diskInfo.usedGb || 0) : 0);
	const freeGB = $derived(diskInfo ? (typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : diskInfo.freeGb || 0) : 0);
	const usedPercentage = $derived(
		diskInfo ? (typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : diskInfo.usedPercentage || 0) : 0
	);
	const usageLevel = $derived(usedPercentage > 85 ? 'high' : usedPercentage > 70 ? 'medium' : 'low');

	// --- Chart Logic ---
	// This effect creates, updates, and destroys the chart instance.
	$effect(() => {
		if (!chartCanvas || !diskInfo) return;

		// Data for the chart, derived from the state
		const used = usedGB;
		const free = freeGB;
		const usedPercent = usedPercentage;

		// If the chart already exists, just update its data for a smooth animation.
		if (chart) {
			chart.data.datasets[0].data = [used];
			chart.data.datasets[1].data = [free];
			chart.options.scales!.x!.max = totalGB; // Update max value if total disk size changes
			chart.update('none');
		} else {
			// This plugin is specific to a 'bar' chart, so its type should reflect that.
			const diskBarLabelPlugin = {
				id: 'diskBarLabelPlugin',
				afterDatasetsDraw(chart: Chart<'bar', number[], string>) {
					const ctx = chart.ctx;
					const { chartArea } = chart;
					ctx.save();
					ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
					ctx.fillText(`${usedPercent.toFixed(1)}% Used`, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
					ctx.restore();
				}
			};

			// Create a new chart instance if it doesn't exist.
			chart = new Chart(chartCanvas, {
				type: 'bar',
				data: {
					labels: ['Disk'],
					datasets: [
						{
							label: 'Used',
							data: [used],
							backgroundColor: usedPercent > 85 ? 'rgba(239, 68, 68, 0.8)' : usedPercent > 70 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(59, 130, 246, 0.8)',
							borderRadius: 8,
							barPercentage: 1.0,
							categoryPercentage: 1.0,
							stack: 'disk'
						},
						{
							label: 'Free',
							data: [free],
							backgroundColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)',
							borderRadius: 8,
							barPercentage: 1.0,
							categoryPercentage: 1.0,
							stack: 'disk'
						}
					]
				},
				plugins: [diskBarLabelPlugin],
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					animation: {
						duration: 1000,
						easing: 'easeInOutQuart'
					},
					plugins: {
						legend: { display: false },
						tooltip: {
							enabled: true,
							backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
							titleColor: theme === 'dark' ? '#f9fafb' : '#111827',
							bodyColor: theme === 'dark' ? '#d1d5db' : '#374151',
							borderColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.5)',
							borderWidth: 1,
							cornerRadius: 8,
							displayColors: true,
							callbacks: {
								label: function (context) {
									const label = context.dataset.label || '';
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const total = used + free;
									const percentage = total ? (value / total) * 100 : 0;
									return `${label}: ${value.toFixed(1)} GB (${percentage.toFixed(1)}%)`;
								}
							}
						}
					},
					scales: {
						x: {
							stacked: true,
							display: false,
							min: 0,
							max: totalGB
						},
						y: {
							display: false,
							stacked: true
						}
					}
				}
			});
		}
	});

	// Cleanup function to destroy the chart instance when the component is unmounted.
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/systemInfo?type=disk"
	pollInterval={10000}
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
		{#if diskInfo}
			<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Disk usage statistics">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<div class="relative">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-full {usageLevel === 'high'
									? 'bg-red-100 dark:bg-red-900/30'
									: usageLevel === 'medium'
										? 'bg-orange-100 dark:bg-orange-900/30'
										: 'bg-blue-100 dark:bg-blue-900/30'}"
								aria-hidden="true"
							>
								<iconify-icon
									icon="mdi:harddisk"
									width="24"
									class={usageLevel === 'high'
										? 'text-red-600 dark:text-red-400'
										: usageLevel === 'medium'
											? 'text-orange-600 dark:text-orange-400'
											: 'text-blue-600 dark:text-blue-400'}
									aria-label="Disk icon"
								></iconify-icon>
							</div>
						</div>
					</div>
					<div>
						<div class="text-2xl font-bold {theme === 'dark' ? 'text-white' : 'text-gray-900'}" aria-live="polite">{usedPercentage.toFixed(1)}%</div>
						<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Disk Used</div>
					</div>
				</div>

				<div class="relative flex-shrink-0" style="height: 48px; min-height: 40px; max-height: 60px; width: 100%;">
					<canvas
						bind:this={chartCanvas}
						class="h-full w-full"
						use:updateChartAction={fetchedData}
						style="display: block; width: 100% !important; height: 100% !important;"
						aria-label="Disk usage bar chart"
					></canvas>
				</div>

				<div class="flex-shrink-0 space-y-3 pb-6">
					<div
						class="relative h-6 overflow-hidden rounded-full {theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}"
						aria-label="Disk usage progress bar"
					>
						<div
							class="h-full rounded-full transition-all duration-700 ease-out {usageLevel === 'high'
								? 'bg-gradient-to-r from-red-500 to-red-600'
								: usageLevel === 'medium'
									? 'bg-gradient-to-r from-orange-500 to-red-500'
									: 'bg-gradient-to-r from-blue-500 to-blue-600'}"
							style="width: {usedPercentage}%"
							aria-valuenow={usedPercentage}
							aria-valuemin="0"
							aria-valuemax="100"
							role="progressbar"
						></div>
						<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
							<span class="text-xs font-semibold text-white drop-shadow-sm">
								Used: {usedGB.toFixed(1)} GB &nbsp;|&nbsp; Free: {freeGB.toFixed(1)} GB
							</span>
						</div>
					</div>

					<div class="grid {currentSize === '1/4' ? 'grid-cols-2' : 'grid-cols-3'} mt-2 gap-3 pb-2 text-xs">
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Total</span>
							<span class="font-semibold {theme === 'dark' ? 'text-white' : 'text-gray-900'}">{totalGB.toFixed(1)} GB</span>
						</div>
						<div class="flex flex-col space-y-1">
							<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Used</span>
							<span
								class="font-semibold {usageLevel === 'high'
									? 'text-red-600 dark:text-red-400'
									: usageLevel === 'medium'
										? 'text-orange-600 dark:text-orange-400'
										: 'text-blue-600 dark:text-blue-400'}"
							>
								{usedGB.toFixed(1)} GB
							</span>
						</div>
						{#if currentSize !== '1/4'}
							<div class="flex flex-col space-y-1">
								<span class={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Free</span>
								<span class="font-semibold {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">{freeGB.toFixed(1)} GB</span>
							</div>
						{/if}
					</div>

					{#if (currentSize === '1/2' || currentSize === '3/4' || currentSize === 'full') && diskInfo}
						<div class="flex justify-between text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mt-1 px-2 pb-4">
							<span>Mount: {diskInfo.mountPoint || '/'}</span>
							{#if diskInfo.filesystem}
								<span>FS: {diskInfo.filesystem}</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite">
				<div class="relative">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true"></div>
				</div>
				<div class="text-center">
					<div class="text-sm font-medium {theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}">Loading disk data</div>
					<div class="text-xs {theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}">Please wait...</div>
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.flex-shrink-0.space-y-3 {
		padding-bottom: 1.25rem; /* 20px for extra bottom padding */
	}
</style>
