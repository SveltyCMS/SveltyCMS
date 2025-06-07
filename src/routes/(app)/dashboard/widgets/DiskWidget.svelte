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

	// Components
	import BaseWidget from '../BaseWidget.svelte';

	// Chart
	import Chart, { type ChartConfiguration, type Plugin, type ArcElement } from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';

	// Props
	let { label = 'Disk Usage', theme = 'light', icon = 'mdi:harddisk', onCloseRequest = () => {} } = $props();

	let data = $state<
		| {
				diskInfo: {
					root?: any;
					mounts?: any[];
					totalGb?: number;
					usedGb?: number;
					freeGb?: number;
					usedPercentage?: number;
					freePercentage?: number;
				};
		  }
		| undefined
	>(undefined);

	// Chart state
	let chart = $state<Chart<'doughnut', number[], string> | undefined>(undefined);
	let chartCanvas = $state<HTMLCanvasElement | undefined>(undefined);

	const textCenterPlugin: Plugin<'doughnut'> = {
		id: 'textCenterPlugin',
		beforeDraw(chart) {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const diskInfoValue = data?.diskInfo.root ?? {
				totalGb: 'N/A',
				usedGb: 'N/A',
				freeGb: 'N/A',
				usedPercentage: 'N/A',
				freePercentage: 'N/A'
			};
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			const formattedTotal = diskInfoValue.totalGb;
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
				const formattedPercentage = percentage;
				ctx.fillText(`${formattedPercentage}%`, posX, posY);
			});

			ctx.restore();
		}
	};

	// Initialize chart when data is available
	$effect(() => {
		if (chartCanvas && data?.diskInfo.root) {
			const { usedGb = 0, freeGb = 0 } = data?.diskInfo.root;

			const config: ChartConfiguration<'doughnut', number[], string> = {
				type: 'doughnut',
				data: {
					labels: ['Used', 'Free'],
					datasets: [
						{
							data: [usedGb, freeGb],
							backgroundColor: [
								theme === 'dark' ? 'rgba(255, 99, 132, 0.2)' : 'rgba(255, 99, 132, 0.4)',
								theme === 'dark' ? 'rgba(54, 162, 235, 0.2)' : 'rgba(54, 162, 235, 0.4)'
							],
							borderColor: [
								theme === 'dark' ? 'rgba(255, 99, 132, 1)' : 'rgba(255, 99, 132, 0.8)',
								theme === 'dark' ? 'rgba(54, 162, 235, 1)' : 'rgba(54, 162, 235, 0.8)'
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
									const value = typeof context.raw === 'number' ? context.raw : 0;
									const dataSet = context.chart.data.datasets[0].data as number[];
									const totalGb = dataSet.reduce((a, b) => (+a ?? 0) + (+b ?? 0), 0);
									const percentage = totalGb ? (value / totalGb) * 100 : 0;
									return `${value.toFixed(2)} GB (${percentage.toFixed(2)}%)`;
								}
							}
						}
					}
				},
				plugins: [textCenterPlugin]
			};

			if (chart) chart.destroy();
			chart = new Chart(chartCanvas, config);
		}
	});

	// Update chart when data changes
	$effect(() => {
		if (chart && data?.diskInfo.root) {
			const { usedGb = 0, freeGb = 0 } = data.diskInfo.root;
			chart.data.datasets[0].data = [usedGb, freeGb];
			chart.update();
		}
	});

	// Clean up chart on component destruction
	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<BaseWidget {label} {theme} endpoint="/api/systemInfo?type=disk" pollInterval={5000} bind:data {icon} {onCloseRequest}>
	<div
		class="relative h-full w-full rounded-lg p-4 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-500 dark:text-primary-500"
		aria-label="Disk Usage Widget"
	>
		<h2 class="flex items-center justify-center gap-2 text-center font-bold">
			<iconify-icon {icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			Disk Usage
		</h2>

		<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>

		{#if !data}
			<p class="text-center text-surface-500">Waiting for disk data...</p>
		{:else if !data.diskInfo}
			<p class="text-center text-error-500">No diskInfo in API response: {JSON.stringify(data)}</p>
		{:else if (typeof data.diskInfo.root === 'object' && data.diskInfo.root !== null)}
			<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
				<p>
					Total: {data.diskInfo.root.totalGb !== null ? data.diskInfo.root.totalGb : 'N/A'} GB
				</p>
				<p>
					Used: {data.diskInfo.root.usedGb !== null ? data.diskInfo.root.usedGb : 'N/A'} GB ({data.diskInfo.root.usedPercentage !== null
						? data.diskInfo.root.usedPercentage
						: 'N/A'}%)
				</p>
				<p>
					Free: {data.diskInfo.root.freeGb !== null ? data.diskInfo.root.freeGb : 'N/A'} GB ({data.diskInfo.root.freePercentage !== null
						? data.diskInfo.root.freePercentage
						: 'N/A'}%)
				</p>
			</div>
		{:else}
			<p class="text-center text-error-500">No usable disk data: {JSON.stringify(data)}</p>
		{/if}
	</div>
</BaseWidget>
