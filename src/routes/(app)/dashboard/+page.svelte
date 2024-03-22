<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { formatUptime } from '@utils/utils';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Chart from 'chart.js/auto';

	// Stores
	import { isLoading } from '@stores/store';

	let systemInfo: any;
	let cpuChart: any;
	let diskChart: any;
	let memoryChart: any;

	onMount(async () => {
		console.log('Component mounted...');

		try {
			// Fetch system info
			$isLoading = true;
			const response = await axios.get('/api/systemInfo');
			systemInfo = response.data;
			initializeCharts();
		} catch (error) {
			console.error(`Error fetching system info: ${error}`);
			systemInfo = null;
		} finally {
			$isLoading = false; // Set loading to false after the request (success or failure)
		}

		if (systemInfo) {
			// Fetch uptime every second
			setInterval(async () => {
				try {
					const response = await axios.get('/api/systemInfo');
					systemInfo.osInfo.uptime = response.data.osInfo.uptime;
				} catch (error) {
					console.error(`Error updating uptime: ${error}`);
				}
			}, 1000);

			// Fetch CPU info every 10 seconds
			setInterval(async () => {
				try {
					const response = await axios.get('/api/systemInfo');
					systemInfo.cpuInfo = response.data.cpuInfo;
					updateCpuChart();
				} catch (error) {
					console.error(`Error updating CPU info: ${error}`);
				}
			}, 10000);

			// Fetch disk info every minute
			setInterval(async () => {
				try {
					const response = await axios.get('/api/systemInfo');
					systemInfo.diskInfo = response.data.diskInfo;
					updateDiskChart();
				} catch (error) {
					console.error(`Error updating disk info: ${error}`);
				}
			}, 60000);

			// Fetch memory info every 30 seconds
			setInterval(async () => {
				try {
					const response = await axios.get('/api/systemInfo');
					systemInfo.memoryInfo = response.data.memoryInfo;
					updateMemoryChart();
				} catch (error) {
					console.error(`Error updating memory info: ${error}`);
				}
			}, 30000);
		}
	});

	const initializeCharts = () => {
		try {
			// Initialize charts using Line and Pie components
			console.log('Initializing charts...');

			cpuChart = initLineChart('cpuChart', 'line', systemInfo.cpuInfo.timeStamps, systemInfo.cpuInfo.cpuUsage);
			console.log(cpuChart);
			diskChart = initPieChart('diskChart', 'pie', ['Used', 'Free'], [systemInfo.diskInfo.usedGb, systemInfo.diskInfo.freeGb]);
			memoryChart = initLineChart('memoryChart', 'line', systemInfo.memoryInfo.timeStamps, systemInfo.memoryInfo.memoryData);
		} catch (err) {
			const error = `Error initializing charts: ${err}`;
			console.error(error);
		}
	};

	const initLineChart = (canvasId: string, label: string, labels: string[], data: number[]) => {
		const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
		if (canvasElement) {
			const ctx = canvasElement.getContext('2d');
			if (ctx) {
				return new Chart(ctx, {
					type: 'line',
					data: {
						labels: labels,
						datasets: [
							{
								label: label,
								data: data,
								fill: false,
								backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)'],
								borderColor: ['rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)'],
								borderWidth: 1,
								tension: 0.1
							}
						]
					}
				});
			}
		}
		throw new Error(`Canvas element with ID '${canvasId}' not found.`);
	};

	const initPieChart = (canvasId: string, label: string, labels: string[], data: number[]) => {
		const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
		if (canvasElement) {
			const ctx = canvasElement.getContext('2d');
			if (ctx) {
				return new Chart(ctx, {
					type: 'pie',
					data: {
						labels: labels,
						datasets: [
							{
								data: data,
								backgroundColor: ['rgb(255, 99, 132)', 'rgb(75, 192, 192)']
							}
						]
					}
				});
			}
		}
		throw new Error(`Canvas element with ID '${canvasId}' not found.`);
	};

	const updateCpuChart = async () => {
		try {
			// Fetch new data
			const response = await axios.get('/api/systemInfo');
			const newSystemInfo = response.data;

			// Check if cpuChart is defined
			if (cpuChart) {
				// Add new data point
				cpuChart.data.labels.push(newSystemInfo.cpuInfo.timeStamps.slice(-1)[0]);
				cpuChart.data.datasets[0].data.push(newSystemInfo.cpuInfo.cpuUsage.slice(-1)[0]);

				// Remove first data point if there are more than 600
				if (cpuChart.data.labels.length > 600) {
					cpuChart.data.labels.shift();
					cpuChart.data.datasets[0].data.shift();
				}

				// Update chart
				cpuChart.update();
			}
		} catch (error) {
			console.error(`Error updating CPU chart: ${error}`);
		}
	};

	const updateDiskChart = async () => {
		try {
			const response = await axios.get('/api/systemInfo');
			const newSystemInfo = response.data;

			// Check if diskChart is defined
			if (diskChart) {
				// Update data points
				diskChart.data.datasets[0].data = [newSystemInfo.diskInfo.usedGb, newSystemInfo.diskInfo.freeGb];

				// Update chart
				diskChart.update();
			}
		} catch (error) {
			console.error(`Error updating Disk chart: ${error}`);
		}
	};

	const updateMemoryChart = async () => {
		try {
			const response = await axios.get('/api/systemInfo');
			const newSystemInfo = response.data;

			// Check if memoryChart is defined
			if (memoryChart) {
				// Update data points
				memoryChart.data.datasets[0].data = newSystemInfo.memoryInfo.memoryData;

				// Update chart
				memoryChart.update();
			}
		} catch (error) {
			console.error(`Error updating Memory chart: ${error}`);
		}
	};

	// Define a function to calculate the average of an array
	const calculateAverage = (arr: any) => {
		if (arr.length === 0) return 0; // Handle division by zero
		const sum = arr.reduce((acc: any, val: any) => acc + val, 0);
		return (sum / arr.length).toFixed(2);
	};
</script>

<div class="mb-2 flex items-center">
	<PageTitle name="Dashboard for {publicEnv.SITE_NAME}" icon="" />
</div>

<div class="flex items-center justify-around gap-2 rounded-b">
	<section class="rounded border p-4"><canvas id="cpuChart"></canvas></section>
	<section class="rounded border p-4"><canvas id="diskChart"></canvas></section>
	<section class="rounded border p-4"><canvas id="memoryChart"></canvas></section>
</div>

{#if systemInfo != null}
	<div class="card">
		<header class="card-header rounded-t bg-tertiary-500 text-center text-lg font-bold text-white dark:bg-primary-500">
			<h2 class="flex justify-center gap-2">
				<iconify-icon icon="codicon:server-environment" width="24" />
				Server Information
			</h2>
		</header>
		<div class="flex justify-around rounded-b pb-2">
			<section>
				<!-- Display OS information  -->
				<div><span class="text-tertiary-500 dark:text-primary-500">Operating System:</span> {systemInfo.osInfo.platform}</div>
				<div><span class="text-tertiary-500 dark:text-primary-500">Hostname:</span> {systemInfo.osInfo.hostname}</div>
				<div><span class="text-tertiary-500 dark:text-primary-500">Type:</span> {systemInfo.osInfo.type}</div>
				<div><span class="text-tertiary-500 dark:text-primary-500">Architecture:</span> {systemInfo.osInfo.arch}</div>
				<div><span class="text-tertiary-500 dark:text-primary-500">Uptime:</span> {formatUptime(systemInfo.osInfo.uptime)}</div>
			</section>

			<!-- CPU Usage -->
			<div class="card">
				<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">CPU Usage</header>

				<section class="rounded border p-4"></section>
				{#if cpuChart > 0}
					<canvas id="cpuChart"></canvas>
				{:else}
					<div class="animate-pulse text-center">Loading...</div>
				{/if}
				<footer class="card-footer">
					<span class="text-tertiary-500 dark:text-primary-500">Current CPU Usage:</span>
					{calculateAverage(systemInfo.cpuInfo.cpuUsage)}%
				</footer>
			</div>
		</div>
	</div>

	<hr />
	<div class="flex items-center justify-between gap-2">
		<!-- Disk usage pie chart container -->
		<div class="card w-full">
			<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">Disk Usage</header>
			{#if diskChart > 0}
				<section class="rounded p-4">
					<canvas id="diskChart"></canvas>
				</section>
			{:else}
				<div class="animate-pulse text-center">Loading...</div>
			{/if}
			<footer class="card-footer">
				<span class="text-tertiary-500 dark:text-primary-500">Drive Free:</span>
				{systemInfo.diskInfo.freeGb} GB, <span class="text-tertiary-500 dark:text-primary-500">Drive Used:</span>
				{systemInfo.diskInfo.usedGb} GB
			</footer>
		</div>

		<!-- Memory usage line chart container -->
		<div class="card w-full">
			<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">Memory Usage</header>
			{#if memoryChart > 0}
				<section class="rounded p-4">
					<canvas id="memoryChart"></canvas>
				</section>
			{:else}
				<div class="animate-pulse text-center">Loading...</div>
			{/if}
			<footer class="card-footer">
				<span class="text-tertiary-500 dark:text-primary-500">Memory Free:</span>
				{systemInfo.memoryInfo.freeMemMb} MB, <span class="text-tertiary-500 dark:text-primary-500">Memory Total:</span>: {systemInfo.memoryInfo
					.totalMemMb} MB
			</footer>
		</div>
	</div>

	<div class="flex justify-between gap-2">
		<!-- Top 5 Content -->
		<div class="card w-full">
			<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">Top 5 Content</header>
			<section class="rounded p-4">
				<li>Content Title</li>
			</section>
			<footer class="card-footer"></footer>
		</div>

		<!-- Online Team Members -->
		<div class="card w-full">
			<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">Online Team Members</header>
			<section class="rounded p-4">
				<li>Team name</li>
			</section>
			<footer class="card-footer"></footer>
		</div>
	</div>

	<!-- Last 5 Contents updates -->
	<div class="card w-full">
		<header class="card-header font-bold text-tertiary-500 dark:text-primary-500">Last Content Updated</header>
		<section class="rounded p-4">
			<li>Content Title</li>
		</section>
		<footer class="card-footer"></footer>
	</div>
{:else}
	<div>Error fetching system information.</div>
{/if}

<!-- <div class="card">
	<header class="card-header font-bold text-primary-500">Total Traffic</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div>
<div class="card">
	<header class="card-header font-bold text-primary-500">Top Content</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div>
<div class="card">
	<header class="card-header font-bold text-primary-500">World Reach</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div>

<div class="card">
	<header class="card-header font-bold text-primary-500">OS Platforms</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div>
<div class="card">
	<header class="card-header font-bold text-primary-500">Latest Content</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div>
<div class="card">
	<header class="card-header font-bold text-primary-500">Team members</header>
	<section class="p-4">(content)</section>
	<footer class="card-footer">(footer)</footer>
</div> -->
