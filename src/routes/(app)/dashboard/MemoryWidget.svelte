<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import Chart from 'chart.js/auto';
	import 'chartjs-adapter-date-fns';

	export const id: string = crypto.randomUUID();
	export const x: number = 0;
	export const y: number = 0;
	export const w: number = 2;
	export const h: number = 5;
	export const min: { w: number; h: number } = { w: 1, h: 1 };
	export const max: { w: number; h: number } | undefined = { w: 2, h: 5 };
	export const movable: boolean = true;
	export const resizable: boolean = true;

	const memoryInfo = writable<{ totalMemMb: number; usedMemMb: number; freeMemMb: number; usedMemPercentage: number; freeMemPercentage: number }>({
		totalMemMb: 0,
		usedMemMb: 0,
		freeMemMb: 0,
		usedMemPercentage: 0,
		freeMemPercentage: 0
	});

	let chart;
	let chartCanvas;

	async function fetchData() {
		try {
			const res = await fetch('/api/systemInfo');
			const data = await res.json();
			memoryInfo.set(data.memoryInfo);
		} catch (error) {
			console.error('Error fetching memory data:', error);
		}
	}

	const textCenterPlugin = {
		id: 'textCenterPlugin',
		beforeDraw: (chart) => {
			const ctx = chart.ctx;
			const { width, height } = chart;
			const memoryInfoValue = $memoryInfo;
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			ctx.fillText(`${(memoryInfoValue.totalMemMb / 1024).toFixed(2)} GB`, width / 2, height / 2);

			// Draw used and free percentages directly on the chart
			chart.data.datasets[0].data.forEach((value, index) => {
				const percentage = index === 0 ? memoryInfoValue.usedMemPercentage : memoryInfoValue.freeMemPercentage;
				const angle = (chart.getDatasetMeta(0).data[index].startAngle + chart.getDatasetMeta(0).data[index].endAngle) / 2;
				const posX = width / 2 + Math.cos(angle) * (width / 4);
				const posY = height / 2 + Math.sin(angle) * (height / 4);
				ctx.fillText(`${percentage.toFixed(2)}%`, posX, posY);
			});

			ctx.restore();
		}
	};

	onMount(async () => {
		await fetchData();
		const { usedMemMb, freeMemMb } = $memoryInfo;

		chart = new Chart(chartCanvas, {
			type: 'doughnut',
			data: {
				labels: ['Used', 'Free'],
				datasets: [
					{
						data: [usedMemMb, freeMemMb],
						backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)'],
						borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)'],
						borderWidth: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					textCenterPlugin, // Register the plugin
					tooltip: {
						callbacks: {
							label: function (context) {
								const label = context.label || '';
								const value = context.raw || 0;
								const totalMemMb = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
								const percentage = (value / totalMemMb) * 100;
								return `${(value / 1024).toFixed(2)} GB (${percentage.toFixed(2)}%)`;
							}
						}
					}
				}
			}
		});

		const interval = setInterval(fetchData, 5000);
		onDestroy(() => clearInterval(interval));
	});

	// Update chart when data changes
	$: {
		if (chart) {
			const { usedMemMb, freeMemMb } = $memoryInfo;
			chart.data.datasets[0].data = [usedMemMb, freeMemMb];
			chart.update();
		}
	}
</script>

<div class="relative h-full w-full rounded-lg border bg-white p-2">
	<h2 class="text-center font-bold">Memory Usage</h2>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
	<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
		<p>Total: {($memoryInfo.totalMemMb / 1024).toFixed(2)} GB</p>
		<p>Used: {($memoryInfo.usedMemMb / 1024).toFixed(2)} GB ({$memoryInfo.usedMemPercentage}%)</p>
		<p>Free: {($memoryInfo.freeMemMb / 1024).toFixed(2)} GB ({$memoryInfo.freeMemPercentage}%)</p>
	</div>
</div>
