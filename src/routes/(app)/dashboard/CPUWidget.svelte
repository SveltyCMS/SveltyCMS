<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import Chart from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';

	export let id: string = crypto.randomUUID();
	export let x: number = 0;
	export let y: number = 0;
	export let w: number = 2;
	export let h: number = 5;
	export let min: { w: number; h: number } = { w: 1, h: 1 };
	export let max: { w: number; h: number } | undefined = undefined;
	export let movable: boolean = true;
	export let resizable: boolean = true;

	const cpuInfo = writable<{ cpuUsage: number[]; timeStamps: string[] }>({ cpuUsage: [], timeStamps: [] });

	let chart;
	let chartCanvas;

	async function fetchData() {
		const res = await fetch('/api/systemInfo');
		const data = await res.json();
		cpuInfo.set(data.cpuInfo);
	}

	onMount(async () => {
		await fetchData();
		const { cpuUsage, timeStamps } = $cpuInfo;

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
				maintainAspectRatio: false
			}
		});
	});

	// Update chart when data changes
	$: {
		if (chart) {
			chart.data.labels = $cpuInfo.timeStamps;
			chart.data.datasets[0].data = $cpuInfo.cpuUsage;
			chart.update();
		}
	}
</script>

<div class="relative h-full w-full rounded-lg border bg-white p-2">
	<h2 class="text-center font-bold">CPU Usage</h2>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
</div>
