<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import Loading from '@src/components/Loading.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { Chart } from 'chart.js';
	import { formatUptime } from '@src/utils/utils';

	let systemInfo: any;
	let loading = true; // Set loading to true by default
	let cpuChart: any;
	let diskChart: any;
	let memoryChart: any;

	const initializeCharts = () => {
		cpuChart = initLineChart('cpuChart', 'CPU Usage', systemInfo.cpuInfo.timeStamps, systemInfo.cpuInfo.cpuUsage);
		diskChart = initPieChart('diskChart', 'Disk Usage', ['Used', 'Free'], [systemInfo.diskInfo.usedGb, systemInfo.diskInfo.freeGb]);
		memoryChart = initLineChart('memoryChart', 'Memory Usage', systemInfo.memoryInfo.timeStamps, systemInfo.memoryInfo.memoryData);
	};

	const initLineChart = (canvasId: string, label: string, labels: string[], data: number[]) => {
		const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
		if (canvasElement) {
			const ctx = canvasElement.getContext('2d');
			if (ctx) {
				const chart = new Chart(ctx, {
					type: 'line',
					data: {
						labels: labels,
						datasets: [
							{
								label: label,
								data: data,
								fill: false,
								borderColor: 'rgb(75, 192, 192)',
								tension: 0.1
							}
						]
					}
				});
				return chart;
			}
		}
		return null;
	};

	const initPieChart = (canvasId: string, label: string, labels: string[], data: number[]) => {
		const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;
		if (canvasElement) {
			const ctx = canvasElement.getContext('2d');
			if (ctx) {
				const chart = new Chart(ctx, {
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
				return chart;
			}
		}
		return null;
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

	onMount(async () => {
		try {
			const response = await axios.get('/api/systemInfo');
			systemInfo = response.data;
			initializeCharts();
		} catch (error) {
			console.error(`Error fetching system info: ${error}`);
			systemInfo = null;
		} finally {
			loading = false; // Set loading to false after the request (success or failure)
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
				} catch (error) {
					console.error(`Error updating disk info: ${error}`);
				}
			}, 60000);

			// Fetch memory info every 30 seconds
			setInterval(async () => {
				try {
					const response = await axios.get('/api/systemInfo');
					systemInfo.memoryInfo = response.data.memoryInfo;
				} catch (error) {
					console.error(`Error updating memory info: ${error}`);
				}
			}, 30000);
		}
	});
</script>

<div class="mb-2 flex items-center">
	<PageTitle name="Dashboard for {PUBLIC_SITENAME}" icon="" />
</div>

{#if systemInfo}
	<!-- Display system information here -->
	<div>CPU Infos: {systemInfo.cpuInfo.avgIdle}%</div>
	<div>Drive Free: {systemInfo.diskInfo.freeGb} GB</div>
	<div>Drive Used: {systemInfo.diskInfo.usedGb} GB</div>
	<div>Memory Free: {systemInfo.memoryInfo.freeMemMb} MB</div>
	<div>Memory Total: {systemInfo.memoryInfo.totalMemMb} MB</div>

	<div class="frounded card variant-outline-surface">
		<header class="card-header rounded-t bg-primary-500 text-center text-lg font-bold">
			<h2 class="flex items-center justify-center gap-2">
				<iconify-icon icon="codicon:server-environment" width="24"></iconify-icon>
				Server Information
			</h2>
		</header>
		<section class=" rounded-b p-4">
			<div><span class="text-primary-500">Operating System:</span> {systemInfo.osInfo.platform}</div>
			<div><span class="text-primary-500">Hostname:</span> {systemInfo.osInfo.hostname}</div>
			<div><span class="text-primary-500">Type:</span> {systemInfo.osInfo.type}</div>
			<div><span class="text-primary-500">Architecture:</span> {systemInfo.osInfo.arch}</div>
			<div><span class="text-primary-500">Uptime:</span> {formatUptime(systemInfo.osInfo.uptime)}</div>
		</section>
	</div>

	<div></div>

	<!-- CPU Usage -->
	{#if cpuChart}
		<div class="card">
			<header class="card-header font-bold text-primary-500">CPU Usage</header>
			<section class="rounded border p-4">
				<canvas id="cpuChart"></canvas>
			</section>
			<footer class="card-footer">Current CPU Usage: {systemInfo.cpuInfo.avgIdle}%</footer>
		</div>
	{:else}
		<div>Loading...</div>
	{/if}

	<!-- Disk usage pie chart container -->
	{#if diskChart}
		<div class="card">
			<header class="card-header font-bold text-primary-500">Disk Usage</header>
			<section class="rounded p-4">
				<canvas id="diskChart"></canvas>
			</section>
			<footer class="card-footer">Drive Free: {systemInfo.diskInfo.freeGb} GB, Drive Used: {systemInfo.diskInfo.usedGb} GB</footer>
		</div>
	{:else}
		<div>Loading...</div>
	{/if}

	<!-- Memory usage line chart container -->
	{#if memoryChart}
		<div class="card">
			<header class="card-header font-bold text-primary-500">Memory Usage</header>
			<section class="rounded p-4">
				<canvas id="memoryChart"></canvas>
			</section>
			<footer class="card-footer">Memory Free: {systemInfo.memoryInfo.freeMemMb} MB, Memory Total: {systemInfo.memoryInfo.totalMemMb} MB</footer>
		</div>
	{:else}
		<div>Loading...</div>
	{/if}

	<!-- Top 5 Contents -->
	<div class="card">
		<header class="card-header font-bold text-primary-500">Top 5 Contents</header>
		<section class="rounded p-4">
			<li>Content Title</li>
		</section>
		<footer class="card-footer"></footer>
	</div>
	<!-- Last 5 Contents updates -->

	<div class="card">
		<header class="card-header font-bold text-primary-500">Last Content Updated</header>
		<section class="rounded p-4">
			<li>Content Title</li>
		</section>
		<footer class="card-footer"></footer>
	</div>

	<!-- Online Team Members -->
	<div class="card">
		<header class="card-header font-bold text-primary-500">Online Team Members</header>
		<section class="rounded p-4">
			<li>Team name</li>
		</section>
		<footer class="card-footer"></footer>
	</div>
{:else if loading}
	<Loading />
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
