<script lang="ts">
	import { onMount } from 'svelte';

	interface PerformanceData {
		summary: {
			services: Array<{
				name: string;
				avgInitTime?: number;
				minInitTime?: number;
				maxInitTime?: number;
				variance: number;
				reliability: number;
				failures: number;
				restarts: number;
			}>;
			system: {
				totalInitTime?: number;
				successRate: number;
			};
		};
		bottlenecks: Array<{
			service: string;
			issue: string;
			severity: 'low' | 'medium' | 'high';
			details: string;
		}>;
		analysis: {
			overallHealth: string;
			slowestService: string;
			mostReliableService: string;
			totalBottlenecks: number;
		};
	}

	let performanceData = $state<PerformanceData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function fetchPerformanceData() {
		try {
			loading = true;
			error = null;
			const response = await fetch('/api/system/performance');
			const result = await response.json();

			if (result.success) {
				performanceData = result.data;
			} else {
				error = result.error || 'Failed to fetch performance data';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchPerformanceData();
	});

	function getSeverityColor(severity: 'low' | 'medium' | 'high') {
		switch (severity) {
			case 'high':
				return 'text-red-600 bg-red-50 border-red-200';
			case 'medium':
				return 'text-orange-600 bg-orange-50 border-orange-200';
			case 'low':
				return 'text-yellow-600 bg-yellow-50 border-yellow-200';
		}
	}

	function formatTime(ms?: number) {
		if (ms === undefined) return 'N/A';
		return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
	}

	function formatPercent(value: number) {
		return `${(value * 100).toFixed(1)}%`;
	}
</script>

<div class="performance-dashboard space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">System Performance Dashboard</h1>
		<button onclick={fetchPerformanceData} class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50" disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	{#if error}
		<div class="rounded border border-red-200 bg-red-50 p-4 text-red-700">
			{error}
		</div>
	{/if}

	{#if performanceData}
		<!-- Overall Analysis -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
			<div class="rounded border-l-4 border-blue-500 bg-white p-4 shadow">
				<div class="text-sm text-gray-600">Overall Health</div>
				<div class="text-2xl font-bold capitalize">{performanceData.analysis.overallHealth}</div>
			</div>
			<div class="rounded border-l-4 border-purple-500 bg-white p-4 shadow">
				<div class="text-sm text-gray-600">Slowest Service</div>
				<div class="text-2xl font-bold">{performanceData.analysis.slowestService}</div>
			</div>
			<div class="rounded border-l-4 border-green-500 bg-white p-4 shadow">
				<div class="text-sm text-gray-600">Most Reliable</div>
				<div class="text-2xl font-bold">{performanceData.analysis.mostReliableService}</div>
			</div>
			<div class="rounded border-l-4 border-orange-500 bg-white p-4 shadow">
				<div class="text-sm text-gray-600">Bottlenecks</div>
				<div class="text-2xl font-bold">{performanceData.analysis.totalBottlenecks}</div>
			</div>
		</div>

		<!-- Bottlenecks -->
		{#if performanceData.bottlenecks.length > 0}
			<div class="rounded bg-white p-6 shadow">
				<h2 class="mb-4 text-xl font-bold">⚠️ Performance Bottlenecks</h2>
				<div class="space-y-2">
					{#each performanceData.bottlenecks as bottleneck}
						<div class="rounded border p-3 {getSeverityColor(bottleneck.severity)}">
							<div class="flex items-start justify-between">
								<div>
									<div class="font-semibold">{bottleneck.service} - {bottleneck.issue}</div>
									<div class="mt-1 text-sm">{bottleneck.details}</div>
								</div>
								<span class="rounded px-2 py-1 text-xs font-semibold uppercase">
									{bottleneck.severity}
								</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="rounded border border-green-200 bg-green-50 p-4 text-green-700">✓ No performance bottlenecks detected</div>
		{/if}

		<!-- Service Performance Table -->
		<div class="overflow-hidden rounded bg-white shadow">
			<h2 class="p-6 pb-4 text-xl font-bold">Service Performance Metrics</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="border-b bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Service</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Avg Init</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Min/Max</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Variance</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Reliability</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Failures</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Restarts</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each performanceData.summary.services as service}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 font-medium">{service.name}</td>
								<td class="px-6 py-4">{formatTime(service.avgInitTime)}</td>
								<td class="px-6 py-4 text-sm">
									{formatTime(service.minInitTime)} / {formatTime(service.maxInitTime)}
								</td>
								<td class="px-6 py-4">{formatTime(service.variance)}</td>
								<td class="px-6 py-4">
									<span
										class="rounded px-2 py-1 text-xs {service.reliability > 0.95
											? 'bg-green-100 text-green-800'
											: service.reliability > 0.8
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-red-100 text-red-800'}"
									>
										{formatPercent(service.reliability)}
									</span>
								</td>
								<td class="px-6 py-4 text-center">{service.failures}</td>
								<td class="px-6 py-4 text-center">{service.restarts}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- System Summary -->
		<div class="rounded bg-white p-6 shadow">
			<h2 class="mb-4 text-xl font-bold">System Summary</h2>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<span class="text-gray-600">Total Init Time:</span>
					<span class="ml-2 font-semibold">{formatTime(performanceData.summary.system.totalInitTime)}</span>
				</div>
				<div>
					<span class="text-gray-600">Success Rate:</span>
					<span class="ml-2 font-semibold">{formatPercent(performanceData.summary.system.successRate)}</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.performance-dashboard {
		max-width: 1400px;
		margin: 0 auto;
	}
</style>
