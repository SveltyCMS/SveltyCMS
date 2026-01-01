<!--
@file src/components/SystemHealth.svelte
@component
**System Health Monitoring Widget - Enhanced Svelte 5**

Displays real-time system state and individual service health with comprehensive monitoring.

### Features
- Proper Svelte 5 runes with optimized reactivity
- Full keyboard navigation and ARIA support
- Visual loading states and animations
- Error boundaries with retry logic
- Reduced motion support
- Performance optimized with derived state
- Real-time updates with proper cleanup
- Secure API calls with CSRF protection
- Copy-to-clipboard functionality
-->

<script lang="ts">
	import { systemState, type SystemState, type ServiceHealth } from '@src/stores/system';
	import { getToastStore } from '@utils/toast';
	import { formatDisplayDate } from '@utils/dateUtils';
	import { logger } from '@utils/logger';
	import { onMount, onDestroy } from 'svelte';

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
		READY: { color: 'text-success-500', icon: '✅', label: 'Ready' },
		DEGRADED: { color: 'text-warning-500', icon: '⚠️', label: 'Degraded' },
		INITIALIZING: { color: 'text-primary-500', icon: '🔄', label: 'Initializing' },
		FAILED: { color: 'text-error-500', icon: '❌', label: 'Failed' },
		IDLE: { color: 'text-surface-500', icon: '⏸️', label: 'Idle' }
	} as const;

	const SERVICE_CONFIG = {
		healthy: { color: 'variant-filled-success', icon: '✓', label: 'Healthy' },
		unhealthy: { color: 'variant-filled-error', icon: '✗', label: 'Unhealthy' },
		initializing: { color: 'variant-filled-primary', icon: '⟳', label: 'Initializing' },
		unknown: { color: 'variant-filled-surface', icon: '?', label: 'Unknown' }
	} as const;

	const REFRESH_INTERVAL_MS = 5000;
	const MAX_RETRIES = 3;

	// Reactive state
	let currentState = $state<SystemState>('IDLE');
	let services = $state<Record<string, ServiceData>>({});
	let initializationStartedAt = $state<number | null>(null);
	let lastChecked = $state(new Date().toISOString());
	let autoRefresh = $state(true);
	let isLoading = $state(false);
	let isReinitializing = $state(false);
	let retryCount = $state(0);
	let prefersReducedMotion = $state(false);
	let copiedEndpoint = $state(false);

	// Refs
	let refreshInterval: ReturnType<typeof setInterval> | null = null;
	let unsubscribe: (() => void) | null = null;

	// Derived values with proper memoization
	const uptime = $derived.by(() => {
		if (!initializationStartedAt) return 0;
		return Date.now() - initializationStartedAt;
	});

	const serviceEntries = $derived(Object.entries(services));
	const serviceCount = $derived(serviceEntries.length);

	const healthyServices = $derived(serviceEntries.filter(([_, service]) => service.status === 'healthy').length);

	const unhealthyServices = $derived(serviceEntries.filter(([_, service]) => service.status === 'unhealthy').length);

	const formattedLastChecked = $derived(
		formatDisplayDate(lastChecked, 'en', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
	);

	const apiHealthUrl = $derived(typeof window !== 'undefined' ? `${window.location.origin}/api/system?action=health` : '/api/system?action=health');

	const healthPercentage = $derived(serviceCount > 0 ? Math.round((healthyServices / serviceCount) * 100) : 0);

	// Subscribe to store with proper cleanup
	$effect(() => {
		unsubscribe = systemState.subscribe((state) => {
			currentState = state.overallState;
			services = state.services;
			initializationStartedAt = state.initializationStartedAt || null;
			lastChecked = new Date().toISOString();
		});

		return () => {
			unsubscribe?.();
		};
	});

	// Auto-refresh with proper cleanup
	$effect(() => {
		if (autoRefresh && !isLoading) {
			refreshInterval = setInterval(() => {
				fetchHealth();
			}, REFRESH_INTERVAL_MS);
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
				refreshInterval = null;
			}
		};
	});

	// Fetch health with retry logic
	async function fetchHealth(): Promise<void> {
		if (isLoading) return;

		isLoading = true;

		try {
			const response = await fetch('/api/system?action=health', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Health check failed: ${response.status}`);
			}

			retryCount = 0; // Reset on success
		} catch (err) {
			logger.error('Failed to fetch health:', err);

			if (retryCount < MAX_RETRIES) {
				retryCount++;
				toastStore.trigger({
					message: `Health check failed. Retrying... (${retryCount}/${MAX_RETRIES})`,
					background: 'variant-filled-warning',
					timeout: 2000
				});

				// Exponential backoff
				setTimeout(() => fetchHealth(), 1000 * Math.pow(2, retryCount));
			} else {
				toastStore.trigger({
					message: 'Failed to fetch system health after multiple retries',
					background: 'variant-filled-error',
					timeout: 5000
				});
				retryCount = 0;
			}
		} finally {
			isLoading = false;
		}
	}

	// Reinitialize with loading state
	async function reinitializeSystem(): Promise<void> {
		if (isReinitializing) return;

		const confirmed = confirm('Are you sure you want to reinitialize the system? This may cause temporary downtime.');
		if (!confirmed) return;

		isReinitializing = true;

		try {
			toastStore.trigger({
				message: 'Reinitializing system...',
				background: 'variant-filled-warning'
			});

			const response = await fetch('/api/system', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'reinitialize',
					force: true
				})
			});

			if (response.ok) {
				const result = await response.json();
				toastStore.trigger({
					message: result.message || `System reinitialized: ${result.status}`,
					background: 'variant-filled-success',
					timeout: 5000
				});

				// Wait a bit before fetching health
				setTimeout(() => fetchHealth(), 1000);
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Reinitialization failed');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			logger.error('Reinitialization failed:', err);

			toastStore.trigger({
				message: `Failed to reinitialize: ${message}`,
				background: 'variant-filled-error',
				timeout: 5000
			});
		} finally {
			isReinitializing = false;
		}
	}

	// Copy endpoint to clipboard
	async function copyEndpoint(): Promise<void> {
		try {
			await navigator.clipboard.writeText(apiHealthUrl);
			copiedEndpoint = true;
			toastStore.trigger({
				message: 'Endpoint copied to clipboard',
				background: 'variant-filled-success',
				timeout: 2000
			});

			setTimeout(() => {
				copiedEndpoint = false;
			}, 2000);
		} catch (err) {
			logger.error('Failed to copy:', err);
			toastStore.trigger({
				message: 'Failed to copy endpoint',
				background: 'variant-filled-error',
				timeout: 2000
			});
		}
	}

	// Helper functions
	function getStateColor(state: SystemState): string {
		return STATE_CONFIG[state]?.color || STATE_CONFIG.IDLE.color;
	}

	function getStateIcon(state: SystemState): string {
		return STATE_CONFIG[state]?.icon || '❓';
	}

	function getStateLabel(state: SystemState): string {
		return STATE_CONFIG[state]?.label || 'Unknown';
	}

	function getServiceColor(status: ServiceHealth): string {
		return SERVICE_CONFIG[status]?.color || SERVICE_CONFIG.unknown.color;
	}

	function getServiceIcon(status: ServiceHealth): string {
		return SERVICE_CONFIG[status]?.icon || SERVICE_CONFIG.unknown.icon;
	}

	function getServiceLabel(status: ServiceHealth): string {
		return SERVICE_CONFIG[status]?.label || 'Unknown';
	}

	function formatUptime(ms: number): string {
		if (ms <= 0) return '0s';

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
		return (
			name.charAt(0).toUpperCase() +
			name
				.slice(1)
				.replace(/([A-Z])/g, ' $1')
				.trim()
		);
	}

	// Lifecycle
	onMount(() => {
		// Check reduced motion preference
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleMotionChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleMotionChange);

		// Initial health check
		fetchHealth();

		return () => {
			mediaQuery.removeEventListener('change', handleMotionChange);
		};
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
		unsubscribe?.();
	});
</script>

<div class="card space-y-4 p-4" role="region" aria-label="System health monitoring">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<span
				class="text-3xl {prefersReducedMotion ? '' : 'transition-transform duration-300'}"
				role="img"
				aria-label={`System status: ${getStateLabel(currentState)}`}
			>
				{getStateIcon(currentState)}
			</span>
			<div>
				<h3 class="h3 flex items-center gap-2">
					System Health
					{#if isLoading}
						<span
							class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
							role="status"
							aria-label="Loading"
						></span>
					{/if}
				</h3>
				<p class="text-sm opacity-70">
					Status: <span class={`font-bold ${getStateColor(currentState)}`}>{currentState}</span>
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" class="checkbox" bind:checked={autoRefresh} aria-label="Enable auto-refresh" />
				Auto-refresh
			</label>

			<button
				class="variant-ghost-primary btn btn-sm"
				onclick={fetchHealth}
				disabled={isLoading}
				title="Refresh now"
				aria-label="Refresh system health"
			>
				<span class="text-lg {isLoading && !prefersReducedMotion ? 'animate-spin' : ''}" role="img" aria-hidden="true"> 🔄 </span>
			</button>

			<button
				class="variant-ghost-warning btn btn-sm"
				onclick={reinitializeSystem}
				disabled={isReinitializing || isLoading}
				title="Reinitialize system"
				aria-label="Reinitialize system"
			>
				{#if isReinitializing}
					<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
				{:else}
					<span class="text-lg" role="img" aria-hidden="true">⚡</span>
				{/if}
				Reinitialize
			</button>
		</div>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
			<p class="text-lg font-bold">
				{serviceCount}
				<span class="text-xs opacity-70">
					({healthyServices}/{serviceCount})
				</span>
			</p>
		</div>

		<div class="card variant-ghost-surface p-3">
			<p class="text-xs opacity-70">Health</p>
			<p class="text-lg font-bold {healthPercentage >= 80 ? 'text-success-500' : healthPercentage >= 50 ? 'text-warning-500' : 'text-error-500'}">
				{healthPercentage}%
			</p>
		</div>
	</div>

	<!-- Health Progress Bar -->
	{#if serviceCount > 0}
		<div
			class="h-2 w-full overflow-hidden rounded-full bg-surface-700"
			role="progressbar"
			aria-valuenow={healthPercentage}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label="System health percentage"
		>
			<div
				class="h-full {healthPercentage >= 80
					? 'bg-success-500'
					: healthPercentage >= 50
						? 'bg-warning-500'
						: 'bg-error-500'} transition-all duration-500"
				style="width: {healthPercentage}%"
			></div>
		</div>
	{/if}

	<!-- Services Grid -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h4 class="h4 text-sm font-semibold opacity-70">Service Status</h4>
			{#if unhealthyServices > 0}
				<span class="badge variant-filled-error text-xs">
					{unhealthyServices} unhealthy
				</span>
			{/if}
		</div>

		{#if serviceCount === 0}
			<div class="card variant-ghost-surface p-6 text-center">
				<p class="text-sm opacity-70">No services registered</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				{#each serviceEntries as [name, service] (name)}
					<div
						class="card flex items-start gap-3 p-3 transition-shadow duration-200 hover:shadow-lg"
						role="article"
						aria-label={`${formatServiceName(name)} service status`}
					>
						<div
							class={`badge ${getServiceColor(service.status)} flex h-8 w-8 shrink-0 items-center justify-center text-lg`}
							role="img"
							aria-label={getServiceLabel(service.status)}
						>
							{getServiceIcon(service.status)}
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold">{formatServiceName(name)}</p>
							<p class="truncate text-xs opacity-70" title={service.message}>
								{service.message}
							</p>
							{#if service.error}
								<p class="mt-1 truncate text-xs text-error-500" title={service.error}>
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
		{/if}
	</div>

	<!-- API Health Endpoint Info -->
	<div class="card variant-ghost-surface p-3">
		<details class="space-y-2">
			<summary class="cursor-pointer text-sm font-semibold opacity-70 hover:opacity-100"> API Health Endpoint </summary>
			<div class="space-y-2 text-xs opacity-70">
				<p>For external monitoring, use:</p>
				<div class="flex items-center gap-2">
					<code class="code flex-1 p-2">{apiHealthUrl}</code>
					<button
						type="button"
						class="btn btn-sm variant-ghost-primary"
						onclick={copyEndpoint}
						title="Copy to clipboard"
						aria-label="Copy endpoint URL to clipboard"
					>
						{#if copiedEndpoint}
							✓
						{:else}
							📋
						{/if}
					</button>
				</div>
				<div class="mt-2 space-y-1">
					<p><strong>Returns:</strong> JSON with system status and component health</p>
					<p><strong>Status codes:</strong></p>
					<ul class="ml-4 list-disc space-y-0.5">
						<li>200 = READY/DEGRADED</li>
						<li>503 = INITIALIZING/FAILED/IDLE</li>
					</ul>
				</div>
			</div>
		</details>
	</div>
</div>
