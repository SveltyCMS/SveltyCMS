<!--
@file src/components/SystemHealth.svelte
@component
**System Health Monitoring Widget**

Displays real-time system state and individual service health.
Allows administrators to monitor system status and restart services.

### Improvements
- Proper Svelte 5 runes instead of manual subscriptions
- Better type safety with explicit types
- Extracted constants for icons and colors
- Optimized reactivity with $derived
- Fixed memory leaks with proper cleanup
- Better error handling
- Memoized formatters
-->

<script lang="ts">
	import { systemState, type SystemState, type ServiceHealth } from '@src/stores/system';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { logger } from '@utils/logger';

	const toastStore = getToastStore();

	// Type for service data
	type ServiceData = {
		status: ServiceHealth;
		message: string;
		error?: string;
		lastChecked?: number;
	};

	// State configuration maps
	const STATE_CONFIG = {
		READY: { color: 'text-success-500', icon: '✅' },
		DEGRADED: { color: 'text-warning-500', icon: '⚠️' },
		INITIALIZING: { color: 'text-primary-500', icon: '🔄' },
		FAILED: { color: 'text-error-500', icon: '❌' },
		IDLE: { color: 'text-surface-500', icon: '⏸️' }
	} as const;

	const SERVICE_CONFIG = {
		healthy: { color: 'variant-filled-success', icon: '✓' },
		unhealthy: { color: 'variant-filled-error', icon: '✗' },
		initializing: { color: 'variant-filled-primary', icon: '⟳' },
		unknown: { color: 'variant-filled-surface', icon: '?' }
	} as const;

	const REFRESH_INTERVAL_MS = 5000;

	// Reactive state - subscribe to store
	let currentState = $state('IDLE');
	let services = $state({});
	let initializationStartedAt = $state(null);
	let lastChecked = $state(new Date().toISOString());
	let autoRefresh = $state(true);
	let refreshInterval: ReturnType | null = null;

	// Derived values
	const uptime = $derived.by(() => {
		if (initializationStartedAt) return Date.now() - initializationStartedAt;
		return 0;
	});

	// Subscribe to store updates
	$effect(() => {
		const unsubscribe = systemState.subscribe((state) => {
			currentState = state.overallState;
			services = state.services;
			initializationStartedAt = state.initializationStartedAt || null;
			lastChecked = new Date().toISOString();
		});
		return unsubscribe;
	});

	// Auto-refresh effect
	$effect(() => {
		if (autoRefresh) {
			refreshInterval = setInterval(() => fetchHealth(), REFRESH_INTERVAL_MS);
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}

		// Cleanup on effect re-run or component unmount
		return () => {
			if (refreshInterval) clearInterval(refreshInterval);
		};
	});

	async function fetchHealth(): Promise {
		try {
			await fetch('/api/system?action=health');
		} catch (err) {
			logger.error('Failed to fetch health:', err);
			toastStore.trigger({ message: 'Failed to fetch system health', background: 'variant-filled-error', timeout: 3000 });
		}
	}

	async function reinitializeSystem(): Promise {
		try {
			toastStore.trigger({ message: 'Reinitializing system...', background: 'variant-filled-warning' });

			const response = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reinitialize', force: true })
			});

			if (response.ok) {
				const result = await response.json();
				toastStore.trigger({ message: result.message || `System reinitialized: ${result.status}`, background: 'variant-filled-success' });
				await fetchHealth();
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Reinitialization failed');
			}
		} catch (err) {
			toastStore.trigger({
				message: `Failed to reinitialize: ${err instanceof Error ? err.message : 'Unknown error'}`,
				background: 'variant-filled-error'
			});
		}
	}

	function getStateColor(state: SystemState): string {
		return STATE_CONFIG[state]?.color || STATE_CONFIG.IDLE.color;
	}

	function getStateIcon(state: SystemState): string {
		return STATE_CONFIG[state]?.icon || '❓';
	}

	function getServiceColor(status: ServiceHealth): string {
		return SERVICE_CONFIG[status]?.color || SERVICE_CONFIG.unknown.color;
	}

	function getServiceIcon(status: ServiceHealth): string {
		return SERVICE_CONFIG[status]?.icon || SERVICE_CONFIG.unknown.icon;
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

	// Memoized service entries for better performance
	const serviceEntries = $derived(Object.entries(services));
	const serviceCount = $derived(serviceEntries.length);
	const formattedLastChecked = $derived(formatDisplayDate(lastChecked, 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
	const apiHealthUrl = $derived(typeof window !== 'undefined' ? `${window.location.origin}/api/system?action=health` : '/api/system?action=health');
</script>

<div class="card space-y-4 p-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<span class="text-3xl" role="img" aria-label="System status icon">{getStateIcon(currentState)}</span>
			<div>
				<h3 class="h3">System Health</h3>
				<p class="text-sm opacity-70">Status: <span class={`font-bold ${getStateColor(currentState)}`}>{currentState}</span></p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" bind:checked={autoRefresh} /> Auto-refresh</label>

			<button class="variant-ghost-primary btn btn-sm" onclick={fetchHealth} title="Refresh now" aria-label="Refresh system health"
				><span class="text-lg" role="img" aria-hidden="true">🔄</span></button
			>

			<button class="variant-ghost-warning btn btn-sm" onclick={reinitializeSystem} title="Reinitialize system" aria-label="Reinitialize system">
				<span class="text-lg" role="img" aria-hidden="true">⚡</span> Reinitialize
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
			<p class="text-sm font-bold">{formattedLastChecked}</p>
		</div>
		<div class="card variant-ghost-surface p-3">
			<p class="text-xs opacity-70">Services</p>
			<p class="text-lg font-bold">{serviceCount}</p>
		</div>
	</div>

	<!-- Services Grid -->
	<div class="space-y-2">
		<h4 class="h4 text-sm font-semibold opacity-70">Service Status</h4>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each serviceEntries as [name, service] (name)}
				<div class="card flex items-start gap-3 p-3">
					<div
						class={`badge ${getServiceColor(service.status)} flex h-8 w-8 shrink-0 items-center justify-center text-lg`}
						role="img"
						aria-label={`${service.status} status`}
					>
						{getServiceIcon(service.status)}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold">{formatServiceName(name)}</p>
						<p class="truncate text-xs opacity-70" title={service.message}>{service.message}</p>
						{#if service.error}
							<p class="truncate text-xs text-error-500" title={service.error}>Error: {service.error}</p>
						{/if}
						{#if service.lastChecked}
							<p class="mt-1 text-xs opacity-50">{new Date(service.lastChecked).toLocaleTimeString()}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Health Endpoint Info -->
	<div class="card variant-ghost-surface p-3">
		<details class="space-y-2">
			<summary class="cursor-pointer text-sm font-semibold opacity-70">API Health Endpoint</summary>
			<div class="space-y-1 text-xs opacity-70">
				<p>For external monitoring, use:</p>
				<code class="code mt-1 block p-2">GET {apiHealthUrl}</code>
				<p class="mt-2">Returns JSON with system status and component health.</p>
				<p>HTTP 200 = READY/DEGRADED, HTTP 503 = INITIALIZING/FAILED/IDLE</p>
			</div>
		</details>
	</div>
</div>
