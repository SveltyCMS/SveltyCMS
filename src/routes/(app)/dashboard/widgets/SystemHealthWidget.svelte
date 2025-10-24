<!--
@file src/routes/(app)/dashboard/widgets/SystemHealthWidget.svelte
@component
**Dashboard widget for monitoring system health and service status**

@example
<SystemHealthWidget label="System Health" />

### Props
- `label`: The label for the widget (default: 'System Health')

### Features:
- Real-time system state monitoring (IDLE, INITIALIZING, READY, DEGRADED, FAILED)
- Individual service health tracking (database, auth, cache, etc.)
- Service restart capability for administrators
- Auto-refresh with configurable interval
- Theme-aware rendering (light/dark mode support)
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'System Health',
		icon: 'mdi:heart-pulse',
		description: 'Monitor system services and overall health',
		defaultSize: { w: 2, h: 2 }
	};
</script>

<script lang="ts">
	import BaseWidget from '../BaseWidget.svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();

	type SystemState = 'IDLE' | 'INITIALIZING' | 'READY' | 'DEGRADED' | 'FAILED';
	type ServiceHealth = 'healthy' | 'unhealthy' | 'initializing';

	interface ServiceStatus {
		status: ServiceHealth;
		message: string;
		lastChecked?: number;
		error?: string;
	}

	interface HealthData {
		overallStatus: SystemState;
		timestamp: number;
		uptime: number;
		components: Record<string, ServiceStatus>;
	}

	let {
		label = 'System Health',
		theme = 'light',
		icon = 'mdi:heart-pulse',
		widgetId = undefined,
		size = { w: 2, h: 2 },
		onSizeChange = () => {},
		onRemove = () => {}
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: { w: number; h: number };
		onSizeChange?: (newSize: { w: number; h: number }) => void;
		onRemove?: () => void;
	}>();

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
				return 'mdi:check-circle';
			case 'DEGRADED':
				return 'mdi:alert';
			case 'INITIALIZING':
				return 'mdi:loading';
			case 'FAILED':
				return 'mdi:close-circle';
			case 'IDLE':
				return 'mdi:pause-circle';
			default:
				return 'mdi:help-circle';
		}
	}

	function getServiceBadgeClass(status: ServiceHealth): string {
		switch (status) {
			case 'healthy':
				return 'variant-filled-primary';
			case 'unhealthy':
				return 'variant-filled-error';
			case 'initializing':
				return 'variant-filled-warning';
			default:
				return 'variant-filled-surface';
		}
	}

	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m`;
		return `${seconds}s`;
	}

	function formatServiceName(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
	}
</script>

<BaseWidget {label} {theme} endpoint="/api/dashboard/health" pollInterval={5000} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
	{#snippet children({ data }: { data: HealthData | undefined })}
		{#if data}
			<div class="flex h-full flex-col gap-3">
				<!-- Overall Status -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<iconify-icon icon={getStateIcon(data.overallStatus)} class={`text-2xl ${getStateColor(data.overallStatus)}`} width="24"></iconify-icon>
						<div>
							<span class={`font-bold ${getStateColor(data.overallStatus)}`}>
								{data.overallStatus}
							</span>
							<p class="text-xs opacity-70">Uptime: {formatUptime(data.uptime)}</p>
						</div>
					</div>

					<button class="variant-ghost-warning btn btn-sm" onclick={reinitializeSystem} title="Reinitialize system">
						<iconify-icon icon="mdi:refresh" width="16"></iconify-icon>
					</button>
				</div>

				<!-- Services Grid -->
				<div class="grid flex-1 grid-cols-2 gap-2 overflow-y-auto" style="max-height: calc({size.h} * 120px - 80px);">
					{#each Object.entries(data.components) as [name, service]}
						<div class="card variant-ghost-surface flex flex-col gap-1 p-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-semibold">{formatServiceName(name)}</span>
								<span class={`badge ${getServiceBadgeClass(service.status)}`}>
									{service.status}
								</span>
							</div>
							<p class="truncate text-xs opacity-70" title={service.message}>
								{service.message}
							</p>
							{#if service.error}
								<p class="truncate text-xs text-error-500" title={service.error}>
									{service.error}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400">
				<iconify-icon icon="mdi:alert-circle-outline" width="32" class="mb-2 text-surface-400"></iconify-icon>
				<span>Health data unavailable</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
