<!--
@file src/routes/(app)/dashboard/widgets/CPUWidget.svelte
@description Reusable widget for displaying CPU usage data with support for dynamic sizing, light/dark mode, and a11y improvements.

Features:
- Supports light/dark themes based on global theme settings
- Customizable widget sizes with default and minimum size restrictions
 Accessible by keyboard and screen readers with proper aria-labels
- Responsive and optimized for performance
- Uses efficient data fetching with cache-busting

Usage:
<CPUWidget label="CPU Usage" />
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable, get } from 'svelte/store';
	import Chart from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';

	// Props for widget configuration
	export let label = 'CPU Usage';
	export const id: string = crypto.randomUUID();
	export const x: number = 0;
	export const y: number = 0;
	export const w: number = 2;
	export const h: number = 5;
	export const min: { w: number; h: number } = { w: 1, h: 1 };
	export const max: { w: number; h: number } | undefined = undefined;
	export const movable: boolean = true;
	export const resizable: boolean = true;

	// CPU info store
	const cpuInfo = writable<{ cpuUsage: number[]; timeStamps: string[] }>({ cpuUsage: [], timeStamps: [] });

	let chart: Chart;
	let chartCanvas: HTMLCanvasElement;
	let interval: ReturnType<typeof setInterval>;

	// Fetch CPU data from the server with cache-busting
	async function fetchData() {
		try {
			const timestamp = new Date().getTime();
			const res = await fetch(`/api/systemInfo?_=${timestamp}`);
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data = await res.json();
			cpuInfo.set(data.cpuInfo);
		} catch (error) {
			console.error('Error fetching CPU data:', error);
		}
	}

	onMount(async () => {
		// Initial data fetch
		await fetchData();

		const { cpuUsage, timeStamps } = get(cpuInfo);

		// Initialize the Chart
		chart = new Chart(chartCanvas, {
			type: 'line',
			data: {
				labels: timeStamps,
				datasets: [
					{
						label: 'CPU Usage (%)',
						data: cpuUsage,
						borderColor: 'rgba(75, 192, 192, 1)',
						backgroundColor: 'rgba(75, 192, 192, 0.2)',
						fill: true
					}
				]
			},
			options: {
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'second'
						}
					},
					y: {
						beginAtZero: true,
						max: 100
					}
				},
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					tooltip: {
						callbacks: {
							label: (context) => `Usage: ${context.raw}%`
						}
					}
				}
			}
		});

		// Poll for new CPU data every 5 seconds
		interval = setInterval(fetchData, 5000);
	});

	// Update the chart whenever the data changes
	$: {
		if (chart) {
			const { cpuUsage, timeStamps } = get(cpuInfo);
			chart.data.labels = timeStamps;
			chart.data.datasets[0].data = cpuUsage;
			chart.update();
		}
	}

	// Clean up on component destruction
	onDestroy(() => {
		if (interval) clearInterval(interval);
		if (chart) chart.destroy();
	});
</script>

<!-- Widget UI -->
<div
	class="relative h-full w-full rounded-lg p-4 text-tertiary-500 transition-colors duration-300 ease-in-out dark:bg-surface-500 dark:text-primary-500"
	aria-label="CPU Usage Widget"
>
	<h2 class="text-center font-bold" aria-label="CPU Usage">{label}</h2>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2" aria-label="CPU Usage Chart"></canvas>
</div>
