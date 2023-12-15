<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import PageTitle from '@components/PageTitle.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { onMount, onDestroy } from 'svelte';
	import { cpu, netstat, drive } from 'node-os-utils';
	import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale } from 'chart.js';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale);

	let canvas;
	let chart;
	let cpuData = Array(60).fill(0);

	let networkCanvas;
	let networkChart;
	let currentNetworkTraffic = 0; // Declare the variable outside the try block
	let networkData = Array(60).fill(0);

	let hddCanvas;
	let hddChart;
	let hddInfo;
	let FreeHDDSpace = 0; // Initialize the variable
	let TotalHddSpace = 0; // Initialize the variable
	let hddData = Array(60).fill(0);

	let footer;

	// Error handling flags
	let cpuError = false;
	let networkError = false;
	let hddError = false;

	// Common chart configuration options
	const chartOptions = {
		animation: false,
		scales: {
			x: { display: false },
			y: { type: 'linear', beginAtZero: true }
		}
	};

	// Data update functions
	const updateCpuUsage = async () => {
		try {
			const load = await cpu.usage();
			cpuData.push(load);
			cpuData.shift();
			chart.update();
			cpuError = false;
		} catch (error) {
			console.error(`CPU usage error: ${error}`);
			cpuError = true;
		}
	};

	const updateNetworkStats = async () => {
		try {
			const networkStats = await netstat.inOut();
			if (networkStats && networkStats.total) {
				networkData.push(networkStats.total.outputMb);
				networkData.shift();

				currentNetworkTraffic = networkStats.total.outputMb / 1000; // Move this line outside the if block

				networkChart.update();
				networkError = false;

				footer.textContent = `Current Network Traffic: ${currentNetworkTraffic} Mbps`;
			}
		} catch (error) {
			console.error(`Network stats error: ${error}`);
			networkError = true;
		}
	};

	const updateHddSpace = async () => {
		try {
			hddInfo = await drive.info();
			if (hddInfo && hddInfo.freePercentage !== undefined) {
				// Check if hddInfo is defined and freePercentage is not undefined
				hddData.push(hddInfo.freePercentage);
				hddData.shift();

				FreeHDDSpace = hddInfo.freePercentage;

				const totalHddSpaceBytes = hddInfo.total;
				const totalHddSpaceGB = totalHddSpaceBytes / 1000000000;
				TotalHddSpace = totalHddSpaceGB;

				const usedPercentage = 100 - hddInfo.freePercentage;

				// Check if the hddChart has been initialized
				if (!hddChart) {
					hddChart = new Chart(hddCanvas.getContext('2d'), {
						type: 'pie',
						data: {
							labels: ['Free Space', 'Used Space'],
							datasets: [
								{
									data: [hddInfo.freePercentage, usedPercentage],
									backgroundColor: ['#00FF00', '#FF0000'],
									hoverOffset: 4
								}
							]
						}
					});
				} else {
					// Update the existing chart
					hddChart.data.datasets[0].data = [hddInfo.freePercentage, usedPercentage];
					hddChart.update();
				}

				hddError = false;

				footer.textContent = `Free HDD Space: ${FreeHDDSpace} GB | Total HDD Space: ${TotalHddSpace} GB`;
			} else {
				console.error('Drive information not available or freePercentage is undefined.');
				hddError = true;
			}
		} catch (error) {
			console.error(`HDD space error: ${error}`);
			hddError = true;
		}
	};

	onMount(() => {
		// CPU chart
		chart = new Chart(canvas.getContext('2d'), {
			type: 'line',
			data: {
				labels: Array(60).fill(''),
				datasets: [
					{
						data: cpuData,
						fill: true,
						backgroundColor: 'rgb(255, 99, 132)',
						borderColor: '#4285f4',
						tension: 0.1
					}
				]
			},
			...chartOptions
		});

		// Network chart
		networkChart = new Chart(networkCanvas.getContext('2d'), {
			type: 'line', // Make sure it's explicitly set to 'line'
			data: {
				labels: Array(60).fill(''),
				datasets: [
					{
						data: networkData,
						fill: true,
						backgroundColor: 'rgb(255, 99, 132)',
						borderColor: '#4285f4',
						tension: 0.1
					}
				]
			},
			...chartOptions
		});

		// HDD chart
		hddChart = new Chart(hddCanvas.getContext('2d'), {
			type: 'pie',
			data: {
				labels: ['Free Space', 'Used Space'],
				datasets: [
					{
						data: [hddInfo.freePercentage, 100 - hddInfo.freePercentage],
						backgroundColor: ['#00FF00', '#FF0000'],
						hoverOffset: 4
					}
				]
			}
		});

		setInterval(updateCpuUsage, 1000);
		setInterval(updateNetworkStats, 1000);
		setInterval(updateHddSpace, 1000);
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
		}
		if (networkChart) {
			networkChart.destroy();
		}
		if (hddChart) {
			hddChart.destroy();
		}
	});
</script>

<div class="mb-2 flex items-center">
	<PageTitle name="Dashboard for {PUBLIC_SITENAME}" icon="" />
</div>

<div class="mt-4 grid gap-4 text-center sm:grid-cols-2 md:grid-cols-3">
	<div class="card">
		<header class="card-header font-bold text-primary-500">CPU Usage</header>
		<section class="rounded bg-white p-4">
			<canvas bind:this={canvas}></canvas>
		</section>
		<footer class="card-footer" bind:this={footer}>Current CPU Usage: {cpuData[cpuData.length - 1]}%</footer>
	</div>

	<div class="card">
		<header class="card-header font-bold text-primary-500">Network Traffic</header>
		<section class="rounded bg-white p-4">
			<canvas bind:this={networkCanvas}></canvas>
		</section>
		<footer class="card-footer">Current Network Traffic: {currentNetworkTraffic} Mbps</footer>
	</div>

	<div class="card">
		<header class="card-header font-bold text-primary-500">HDD Space Available</header>
		<section class="rounded bg-white p-4">
			<canvas bind:this={hddCanvas}></canvas>
		</section>
		<footer class="card-footer">Free Space: {FreeHDDSpace} GB | Total Space: {TotalHddSpace} GB</footer>
	</div>
</div>
