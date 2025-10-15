<!--
@file src/components/SystemHealth.svelte
@component
**System Health Monitoring Widget**

Displays real-time system state and individual service health.
Allows administrators to monitor system status and restart services.
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { systemState, type SystemState, type ServiceHealth } from '@src/stores/system';
import { getToastStore } from '@skeletonlabs/skeleton-svelte';

	const toastStore = getToastStore();

	// Reactive state from store
	let currentState = $state<SystemState>('IDLE');
	let services = $state<any>({});
	let uptime = $state(0);
	let lastChecked = $state(0);
	let autoRefresh = $state(true);
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	// Subscribe to system state
	const unsubscribe = systemState.subscribe((state) => {
		currentState = state.overallState;
		services = state.services;
		if (state.initializationStartedAt) {
			uptime = Date.now() - state.initializationStartedAt;
		}
		lastChecked = Date.now();
	});

	onMount(() => {
		// Auto-refresh every 5 seconds if enabled
		if (autoRefresh) {
			refreshInterval = setInterval(() => {
				// Trigger a re-fetch by calling the health endpoint
				fetchHealth();
			}, 5000);
		}
	});

	onDestroy(() => {
		unsubscribe();
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function fetchHealth() {
		try {
			await fetch('/api/system?action=health');
			// The store will be updated via the backend's state updates
		} catch (error) {
			console.error('Failed to fetch health:', error);
		}
	}

	async function reinitializeSystem() {
		try {
			toastStore.trigger({
				message: 'Reinitializing system...',
				background: 'variant-filled-warning'
			});

			const response = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reinitialize', force: true })
			});

			if (response.ok) {
				const result = await response.json();
				toastStore.trigger({
					message: result.message || `System reinitialized: ${result.status}`,
					background: 'variant-filled-success'
				});
				await fetchHealth();
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Reinitialization failed');
			}
		} catch (error) {
			toastStore.trigger({
				message: `Failed to reinitialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
				background: 'variant-filled-error'
			});
		}
	}

	function getStateColor(state: SystemState): string {
		switch (state) {
			case 'READY':
				return 'text-success-500';
			case 'DEGRADED':
				return 'text-warning-500';
			case 'INITIALIZING':
				return 'text-primary-500';
			case 'FAILED':
				return 'text-error-500';
			case 'IDLE':
				return 'text-surface-500';
			default:
				return 'text-surface-500';
		}
	}

	function getStateIcon(state: SystemState): string {
		switch (state) {
			case 'READY':
				return '✅';
			case 'DEGRADED':
				return '⚠️';
			case 'INITIALIZING':
				return '🔄';
			case 'FAILED':
				return '❌';
			case 'IDLE':
				return '⏸️';
			default:
				return '❓';
		}
	}

	function getServiceColor(status: ServiceHealth): string {
		switch (status) {
			case 'healthy':
				return 'variant-filled-success';
			case 'unhealthy':
				return 'variant-filled-error';
			case 'initializing':
				return 'variant-filled-primary';
			default:
				return 'variant-filled-surface';
		}
	}

	function getServiceIcon(status: ServiceHealth): string {
		switch (status) {
			case 'healthy':
				return '✓';
			case 'unhealthy':
				return '✗';
			case 'initializing':
				return '⟳';
			default:
				return '?';
		}
	}

	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	function formatServiceName(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
	}
</script>

<div class="card space-y-4 p-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<span class="text-3xl">{getStateIcon(currentState)}</span>
			<div>
				<h3 class="h3">System Health</h3>
				<p class="text-sm opacity-70">
					Status: <span class={`font-bold ${getStateColor(currentState)}`}>{currentState}</span>
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					class="checkbox"
					bind:checked={autoRefresh}
					onchange={() => {
						if (autoRefresh) {
							refreshInterval = setInterval(fetchHealth, 5000);
						} else if (refreshInterval) {
							clearInterval(refreshInterval);
						}
					}}
				/>
				Auto-refresh
			</label>

			<button class="variant-ghost-primary btn btn-sm" onclick={fetchHealth} title="Refresh now">
				<span class="text-lg">🔄</span>
			</button>

			<button class="variant-ghost-warning btn btn-sm" onclick={reinitializeSystem} title="Reinitialize system">
				<span class="text-lg">⚡</span>
				Reinitialize
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 gap-4 md:grid-cols-3">
		<div class="card variant-ghost-surface p-3">
			<p class="text-xs opacity-70">Uptime</p>
			<p class="text-lg font-bold">{formatUptime(uptime)}</p>
		</div>

		<div class="card variant-ghost-surface p-3">
			<p class="text-xs opacity-70">Last Checked</p>
			<p class="text-sm font-bold">{new Date(lastChecked).toLocaleTimeString()}</p>
		</div>

		<div class="card variant-ghost-surface p-3">
			<p class="text-xs opacity-70">Services</p>
			<p class="text-lg font-bold">{Object.keys(services).length}</p>
		</div>
	</div>

	<!-- Services Grid -->
	<div class="space-y-2">
		<h4 class="h4 text-sm font-semibold opacity-70">Service Status</h4>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each Object.entries(services) as [name, serviceStatus]}
				{@const service = serviceStatus as { status: ServiceHealth; message: string; error?: string; lastChecked?: number }}
				<div class="card flex items-start gap-3 p-3">
					<div class={`badge ${getServiceColor(service.status)} flex h-8 w-8 items-center justify-center text-lg`}>
						{getServiceIcon(service.status)}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold">{formatServiceName(name)}</p>
						<p class="truncate text-xs opacity-70" title={service.message}>
							{service.message}
						</p>
						{#if service.error}
							<p class="truncate text-xs text-error-500" title={service.error}>
								Error: {service.error}
							</p>
						{/if}
						{#if service.lastChecked}
							<p class="mt-1 text-xs opacity-50">
								{new Date(service.lastChecked).toLocaleTimeString()}
							</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Health Endpoint Info -->
	<div class="card variant-ghost-surface p-3">
		<details class="space-y-2">
			<summary class="cursor-pointer text-sm font-semibold opacity-70"> API Health Endpoint </summary>
			<div class="space-y-1 text-xs opacity-70">
				<p>For external monitoring, use:</p>
				<code class="code mt-1 block p-2">GET {window.location.origin}/api/system?action=health</code>
				<p class="mt-2">Returns JSON with system status and component health.</p>
				<p>HTTP 200 = READY/DEGRADED, HTTP 503 = INITIALIZING/FAILED/IDLE</p>
			</div>
		</details>
	</div>
</div>
