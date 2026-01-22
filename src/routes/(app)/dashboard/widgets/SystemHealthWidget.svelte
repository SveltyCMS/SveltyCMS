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
	// Components
	// Using iconify-icon web component

	// Icons
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Loader from '@lucide/svelte/icons/loader';
	import XCircle from '@lucide/svelte/icons/x-circle';
	import PauseCircle from '@lucide/svelte/icons/pause-circle';
	import HelpCircle from '@lucide/svelte/icons/help-circle';

	// Widgets
	import BaseWidget from '../BaseWidget.svelte';

	// Utils
	import { showToast } from '@utils/toast';
	import type { WidgetSize } from '@src/content/types';

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

	const {
		label = 'System Health',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:heart-pulse',
		widgetId = undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: any) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	async function reinitializeSystem() {
		try {
			showToast('Reinitializing system...', 'warning');

			const response = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reinitialize', force: true })
			});

			if (response.ok) {
				const result = await response.json();
				showToast(result.message || `System reinitialized: ${result.status}`, 'success');
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Reinitialization failed');
			}
		} catch (error) {
			showToast(`Failed to reinitialize: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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

	function getStateIcon(state: SystemState) {
		switch (state) {
			case 'READY':
				return CheckCircle;
			case 'DEGRADED':
				return AlertTriangle;
			case 'INITIALIZING':
				return Loader;
			case 'FAILED':
				return XCircle;
			case 'IDLE':
				return PauseCircle;
			default:
				return HelpCircle;
		}
	}

	function getServiceBadgeClass(status: ServiceHealth): string {
		switch (status) {
			case 'healthy':
				return 'preset-filled-primary-500';
			case 'unhealthy':
				return 'preset-filled-error-500';
			case 'initializing':
				return 'variant-filled-warning';
			default:
				return 'preset-filled-surface-500';
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
					{#if data.overallStatus}
						{@const StateIcon = getStateIcon(data.overallStatus)}
						<div class="flex items-center gap-2">
							<StateIcon size={24} class={getStateColor(data.overallStatus)} />
							<div>
								<span class={`font-bold ${getStateColor(data.overallStatus)}`}>
									{data.overallStatus}
								</span>
								<p class="text-xs opacity-70">Uptime: {formatUptime(data.uptime)}</p>
							</div>
						</div>
					{/if}

					<button class="preset-outlined-warning-500 btn-sm" onclick={reinitializeSystem} title="Reinitialize system">
						<RefreshCw size={16} />
					</button>
				</div>

				<!-- Services Grid -->
				<div class="grid flex-1 grid-cols-2 gap-2 overflow-y-auto" style="max-height: calc({size.h} * 120px - 80px);">
					{#each Object.entries(data.components) as [name, service]}
						<div class="card preset-outlined-surface-500flex flex-col gap-1 p-2">
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
				<CircleAlert size={24} />
				<span>Health data unavailable</span>
			</div>
		{/if}
	{/snippet}
</BaseWidget>
