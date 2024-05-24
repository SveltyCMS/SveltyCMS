<script lang="ts">
	import { onMount } from 'svelte';
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
		const res = await fetch('/api/systemInfo');
		const data = await res.json();
		memoryInfo.set(data.memoryInfo);
	}

	const textCenterPlugin = {
		id: 'textCenterPlugin',
		beforeDraw: (chart) => {
			const { totalMemMb, usedMemMb, freeMemMb, usedMemPercentage, freeMemPercentage } = $memoryInfo;
			const ctx = chart.ctx;
			const { width, height } = chart;
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '18px Arial';

			// Draw total in the center
			ctx.fillText(`${totalMemMb} MB`, width / 2, height / 2);

			// Draw used and free percentages directly on the chart
			chart.data.datasets[0].data.forEach((value, index) => {
				const percentage = index === 0 ? usedMemPercentage : freeMemPercentage;
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
		const { usedMemPercentage, freeMemPercentage } = $memoryInfo;

		Chart.register(textCenterPlugin);

		chart = new Chart(chartCanvas, {
			type: 'doughnut',
			data: {
				labels: ['Used', 'Free'],
				datasets: [
					{
						data: [$memoryInfo.usedMemMb, $memoryInfo.freeMemMb],
						backgroundColor: ['rgba(255, 159, 64, 0.2)', 'rgba(75, 192, 192, 0.2)'],
						borderColor: ['rgba(255, 159, 64, 1)', 'rgba(75, 192, 192, 1)'],
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
								const label = context.label || '';
								const value = context.raw || 0;
								const totalMemMb = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
								const percentage = (value / totalMemMb) * 100;
								return `${value.toFixed(2)} MB (${percentage.toFixed(2)}%)`;
							}
						}
					}
				}
			}
		});
	});

	// Update chart when data changes
	$: {
		if (chart) {
			chart.data.datasets[0].data = [$memoryInfo.usedMemPercentage, $memoryInfo.freeMemPercentage];
			chart.update();
		}
	}
</script>

<div class="relative h-full w-full rounded-lg border bg-white p-2">
	<h2 class="text-center font-bold">Memory Usage</h2>
	<canvas bind:this={chartCanvas} class="h-full w-full p-2"></canvas>
	<div class="absolute bottom-5 left-0 flex w-full justify-between gap-2 px-2 text-xs">
		<p>Total: {$memoryInfo.totalMemMb} MB</p>
		<p>Used: {$memoryInfo.usedMemMb} MB ({$memoryInfo.usedMemPercentage}%)</p>
		<p>Free: {$memoryInfo.freeMemMb} MB ({$memoryInfo.freeMemPercentage}%)</p>
	</div>
</div>
