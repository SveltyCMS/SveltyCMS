<!--
@file src/routes/(app)/dashboard/widgets/SecurityWidget.svelte
@component
**Advanced Security Monitoring Widget**

Real-time security monitoring with threat detection, incident tracking,
and automated response visualization for enterprise security operations.

### Features:
- Live threat level monitoring with color-coded indicators
- Active security incidents list with threat classification
- Blocked/throttled IP tracking with manual override controls
- Security event timeline with pattern analysis
- Automated response status with policy enforcement
- CSP violation monitoring with XSS attempt detection
- Integration with SecurityResponseService for real-time data

### Props:
- `label`: Widget title (default: 'Security Monitor')
- `size`: Widget dimensions in grid units
- `autoRefresh`: Enable automatic data refresh (default: true)
- `refreshInterval`: Refresh interval in milliseconds (default: 5000)

@example
<SecurityWidget label="Security Center" size={{ w: 3, h: 2 }} />

@enterprise Advanced security monitoring for production environments
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Security Monitor',
		icon: 'mdi:shield-alert',
		description: 'Advanced security threat monitoring and incident response',
		defaultSize: { w: 3, h: 3 }
	};
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { logger } from '@utils/logger';
	import { toaster } from '@stores/store.svelte';
	import BaseWidget from '../BaseWidget.svelte';
	// getToastStore deprecated - use custom toaster from @stores/toasterStore;
	import type { WidgetSize } from '@src/content/types';

	const {
		label = 'Security Monitor',
		theme = 'light',
		icon = 'mdi:shield-alert',
		widgetId = undefined,
		size = { w: 3, h: 3 } as WidgetSize,
		autoRefresh = true,
		refreshInterval = 5000,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		autoRefresh?: boolean;
		refreshInterval?: number;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

	// Security data interfaces
	interface SecurityStats {
		activeIncidents: number;
		blockedIPs: number;
		throttledIPs: number;
		totalIncidents: number;
		threatLevelDistribution: {
			none: number;
			low: number;
			medium: number;
			high: number;
			critical: number;
		};
		recentEvents: SecurityEvent[];
		cspViolations: number;
		rateLimitHits: number;
	}

	interface SecurityEvent {
		id: string;
		timestamp: number;
		type: 'rate_limit' | 'auth_failure' | 'csp_violation' | 'threat_detected' | 'ip_blocked';
		severity: 'low' | 'medium' | 'high' | 'critical';
		message: string;
		ip?: string;
		details?: Record<string, any>;
	}

	interface SecurityIncident {
		id: string;
		clientIp: string;
		threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
		indicatorCount: number;
		timestamp: number;
		resolved: boolean;
		responseActions: string[];
	}

	// Reactive state
	let securityStats = $state({
		activeIncidents: 0,
		blockedIPs: 0,
		throttledIPs: 0,
		totalIncidents: 0,
		threatLevelDistribution: { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
		recentEvents: [],
		cspViolations: 0,
		rateLimitHits: 0
	});

	let incidents: SecurityIncident[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let refreshTimer: ReturnType<typeof setInterval> | null = null;

	// Security status calculation - using $derived correctly
	const overallThreatLevel = $derived(calculateOverallThreatLevel(securityStats));
	const threatColor = $derived(getThreatColor(overallThreatLevel));
	const statusIcon = $derived(getThreatIcon(overallThreatLevel));

	function calculateOverallThreatLevel(stats: SecurityStats): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
		const { threatLevelDistribution, activeIncidents } = stats;

		if (threatLevelDistribution.critical > 0 || activeIncidents > 10) return 'critical';
		if (threatLevelDistribution.high > 0 || activeIncidents > 5) return 'high';
		if (threatLevelDistribution.medium > 0 || activeIncidents > 2) return 'medium';
		if (threatLevelDistribution.low > 0 || activeIncidents > 0) return 'low';
		return 'safe';
	}

	function getThreatColor(level: string): string {
		switch (level) {
			case 'safe':
				return 'text-green-500';
			case 'low':
				return 'text-yellow-500';
			case 'medium':
				return 'text-orange-500';
			case 'high':
				return 'text-red-500';
			case 'critical':
				return 'text-red-700 animate-pulse';
			default:
				return 'text-gray-500';
		}
	}

	function getThreatIcon(level: string): string {
		switch (level) {
			case 'safe':
				return 'mdi:shield-check';
			case 'low':
				return 'mdi:shield-alert-outline';
			case 'medium':
				return 'mdi:shield-alert';
			case 'high':
				return 'mdi:shield-remove';
			case 'critical':
				return 'mdi:shield-off';
			default:
				return 'mdi:shield-outline';
		}
	}

	// Data fetching
	async function fetchSecurityData(): Promise<void> {
		try {
			isLoading = true;
			error = null;

			// Fetch security statistics
			const statsResponse = await fetch('/api/security/stats');
			if (!statsResponse.ok) {
				throw new Error(`Security stats fetch failed: ${statsResponse.status}`);
			}
			const stats = await statsResponse.json();

			// Fetch active incidents
			const incidentsResponse = await fetch('/api/security/incidents');
			if (!incidentsResponse.ok) {
				throw new Error(`Incidents fetch failed: ${incidentsResponse.status}`);
			}
			const incidentsData = await incidentsResponse.json();

			securityStats = stats;
			incidents = incidentsData.incidents || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch security data';
			logger.error('Security data fetch error:', err);
		} finally {
			isLoading = false;
		}
	}

	// Incident management
	async function resolveIncident(incidentId: string): Promise<void> {
		try {
			const response = await fetch(`/api/security/incidents/${incidentId}/resolve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (response.ok) {
				toaster.success({ description: 'Incident resolved successfully' });
				await fetchSecurityData(); // Refresh data
			} else {
				throw new Error('Failed to resolve incident');
			}
		} catch (err) {
			toaster.error({ description: `Failed to resolve incident: ${err instanceof Error ? err.message : 'Unknown error'}` });
		}
	}

	async function unblockIP(ip: string): Promise<void> {
		try {
			const response = await fetch('/api/security/unblock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ip })
			});

			if (response.ok) {
				toaster.success({ description: `IP ${ip} unblocked successfully` });
				await fetchSecurityData(); // Refresh data
			} else {
				throw new Error('Failed to unblock IP');
			}
		} catch (err) {
			toaster.error({ description: `Failed to unblock IP: ${err instanceof Error ? err.message : 'Unknown error'}` });
		}
	}

	// Utility functions
	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	function getIncidentPriorityClass(threatLevel: string): string {
		switch (threatLevel) {
			case 'critical':
				return 'border-l-4 border-red-600 bg-red-50 dark:bg-red-900/20';
			case 'high':
				return 'border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/20';
			case 'medium':
				return 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
			case 'low':
				return 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20';
			default:
				return 'border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-800';
		}
	}

	// Lifecycle
	onMount(() => {
		fetchSecurityData();

		if (autoRefresh) {
			refreshTimer = setInterval(fetchSecurityData, refreshInterval);
		}
	});

	onDestroy(() => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
		}
	});
</script>

<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove} {isLoading} {error}>
	<div class="flex h-full flex-col space-y-4 p-2">
		<!-- Security Status Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-3">
				<iconify-icon icon={statusIcon} class="text-2xl {threatColor}"></iconify-icon>
				<div>
					<h3 class="text-lg font-semibold capitalize">{overallThreatLevel} Status</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{securityStats.activeIncidents} active incidents
					</p>
				</div>
			</div>
			<button class="preset-ghost-surface-500 btn btn-sm" onclick={() => fetchSecurityData()} disabled={isLoading} aria-label="Refresh security data">
				<iconify-icon icon="mdi:refresh" class="text-sm"></iconify-icon>
			</button>
		</div>

		<!-- Security Metrics Grid -->
		<div class="grid grid-cols-2 gap-2 text-sm">
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="font-medium text-red-600">Blocked IPs</div>
				<div class="text-xl font-bold">{securityStats.blockedIPs}</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="font-medium text-orange-600">Throttled IPs</div>
				<div class="text-xl font-bold">{securityStats.throttledIPs}</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="font-medium text-purple-600">CSP Violations</div>
				<div class="text-xl font-bold">{securityStats.cspViolations}</div>
			</div>
			<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
				<div class="font-medium text-blue-600">Rate Limits</div>
				<div class="text-xl font-bold">{securityStats.rateLimitHits}</div>
			</div>
		</div>

		<!-- Active Incidents -->
		{#if incidents.length > 0}
			<div class="min-h-0 flex-1">
				<h4 class="mb-2 flex items-center font-medium">
					<iconify-icon icon="mdi:alert-circle" class="mr-2 text-orange-500"></iconify-icon>
					Active Incidents ({incidents.length})
				</h4>
				<div class="max-h-32 space-y-1 overflow-y-auto">
					{#each incidents as incident}
						<div class="rounded p-2 text-xs {getIncidentPriorityClass(incident.threatLevel)}">
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<div class="font-medium">
										{incident.clientIp}
										<span class="ml-1 rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">
											{incident.threatLevel}
										</span>
									</div>
									<div class="text-gray-600 dark:text-gray-400">
										{incident.indicatorCount} indicators • {formatTimestamp(incident.timestamp)}
									</div>
									{#if incident.responseActions.length > 0}
										<div class="mt-1">
											{#each incident.responseActions as action}
												<span class="mr-1 inline-block rounded bg-gray-300 px-1 py-0.5 text-xs dark:bg-gray-600">
													{action}
												</span>
											{/each}
										</div>
									{/if}
								</div>
								<div class="flex space-x-1">
									<button class="btn-xs preset-ghost-surface-500 btn" onclick={() => resolveIncident(incident.id)} title="Resolve incident">
										<iconify-icon icon="mdi:check" class="text-xs"></iconify-icon>
									</button>
									{#if incident.responseActions.includes('block') || incident.responseActions.includes('blacklist')}
										<button class="btn-xs preset-ghost-surface-500 btn" onclick={() => unblockIP(incident.clientIp)} title="Unblock IP">
											<iconify-icon icon="mdi:lock-open" class="text-xs"></iconify-icon>
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex flex-1 items-center justify-center text-gray-500">
				<div class="text-center">
					<iconify-icon icon="mdi:shield-check" class="mb-2 text-4xl text-green-500"></iconify-icon>
					<p class="text-sm">No active security incidents</p>
				</div>
			</div>
		{/if}

		<!-- Threat Level Distribution (if space allows) -->
		{#if size.h >= 3}
			<div class="border-t pt-2">
				<h5 class="mb-1 text-xs font-medium">Threat Distribution</h5>
				<div class="flex space-x-1 text-xs">
					<div class="flex-1 text-center">
						<div class="font-bold text-red-600">{securityStats.threatLevelDistribution.critical}</div>
						<div class="text-gray-500">Critical</div>
					</div>
					<div class="flex-1 text-center">
						<div class="font-bold text-orange-600">{securityStats.threatLevelDistribution.high}</div>
						<div class="text-gray-500">High</div>
					</div>
					<div class="flex-1 text-center">
						<div class="font-bold text-yellow-600">{securityStats.threatLevelDistribution.medium}</div>
						<div class="text-gray-500">Medium</div>
					</div>
					<div class="flex-1 text-center">
						<div class="font-bold text-blue-600">{securityStats.threatLevelDistribution.low}</div>
						<div class="text-gray-500">Low</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</BaseWidget>
