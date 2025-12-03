<!--
@file src/routes/(app)/dashboard/widgets/AuditLogWidget.svelte
@component
**Audit Log Dashboard Widget**

Real-time audit log monitoring with security event tracking, suspicious activity alerts,
and compliance reporting for enterprise security operations.

### Features:
- Live audit statistics with event counts by severity
- Recent security events timeline with color-coded severity
- Suspicious activity detection and alerting
- Security trend indicators and failure rate monitoring
- Role-based visibility (admins see all, users see personal logs)
- Real-time event streaming with auto-refresh
- Quick filtering by event type and severity

### Props:
- `label`: Widget title (default: 'Audit Logs')
- `size`: Widget dimensions in grid units
- `autoRefresh`: Enable automatic data refresh (default: true)
- `refreshInterval`: Refresh interval in milliseconds (default: 10000)
- `showPersonalOnly`: Show only current user's events (default: false)

@example
<AuditLogWidget label="Security Audit" size={{ w: 3, h: 2 }} />

@enterprise Enterprise-grade audit logging for compliance and security monitoring
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: 'Audit Logs',
		icon: 'mdi:security-network',
		description: 'Security audit log monitoring and compliance tracking',
		defaultSize: { w: 3, h: 3 }
	};
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import BaseWidget from '../BaseWidget.svelte';
	import {
		queryAuditLogs,
		getAuditStatistics,
		getSuspiciousActivities,
		type AuditLogEntry,
		type AuditStatistics
	} from '@src/services/auditLogService';
	import type { WidgetSize } from '@src/content/types';

	// Props
	let {
		label = 'Audit Logs',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:security-network',
		size = { w: 3, h: 3 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		resizable = true,
		onRemove = () => {},
		showPersonalOnly = false,
		autoRefresh = true,
		refreshInterval = 10000,
		currentUser = null as any
	} = $props<{
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		resizable?: boolean;
		onRemove?: () => void;
		showPersonalOnly?: boolean;
		autoRefresh?: boolean;
		refreshInterval?: number;
		currentUser?: any;
	}>();

	// State
	let auditStats: AuditStatistics | null = $state(null);
	let recentEvents: AuditLogEntry[] = $state([]);
	let suspiciousEvents: AuditLogEntry[] = $state([]);
	let isLoading = $state(false);
	let error: string | null = $state(null);
	let refreshTimer: NodeJS.Timeout | null = null;
	let selectedFilter = $state('all');

	// Check if user is admin
	const isAdmin = $derived(currentUser?.role === 'admin');
	const canViewSystemLogs = $derived(isAdmin && !showPersonalOnly);

	const severityColors = {
		low: 'bg-blue-100 text-blue-800 border-blue-200',
		medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
		high: 'bg-orange-100 text-orange-800 border-orange-200',
		critical: 'bg-red-100 text-red-800 border-red-200'
	};

	const resultColors = {
		success: 'text-green-600',
		failure: 'text-red-600',
		partial: 'text-yellow-600'
	};

	async function loadAuditData() {
		if (isLoading) return;

		isLoading = true;
		error = null;

		try {
			const queries = [];

			// Load statistics (admin only or personal stats)
			if (canViewSystemLogs) {
				queries.push(getAuditStatistics(7)); // Last 7 days
			}

			// Load recent events
			const eventQuery = canViewSystemLogs
				? queryAuditLogs({ limit: 10 })
				: queryAuditLogs({
						actorId: currentUser?.id,
						limit: 10
					});
			queries.push(eventQuery);

			// Load suspicious activities (admin only)
			if (canViewSystemLogs) {
				queries.push(getSuspiciousActivities(5));
			}

			const results = await Promise.all(queries);

			let resultIndex = 0;

			if (canViewSystemLogs) {
				const statsResult = results[resultIndex++];
				if (statsResult.success && statsResult.data) {
					auditStats = statsResult.data as AuditStatistics;
				}
			}

			const eventsResult = results[resultIndex++];
			if (eventsResult.success && eventsResult.data) {
				recentEvents = eventsResult.data as AuditLogEntry[];
			}

			if (canViewSystemLogs) {
				const suspiciousResult = results[resultIndex++];
				if (suspiciousResult.success && suspiciousResult.data) {
					suspiciousEvents = suspiciousResult.data as AuditLogEntry[];
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load audit data';
			console.error('Audit widget error:', err);
		} finally {
			isLoading = false;
		}
	}

	function startAutoRefresh() {
		if (autoRefresh && refreshInterval > 0) {
			refreshTimer = setInterval(loadAuditData, refreshInterval);
		}
	}

	function stopAutoRefresh() {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
	}

	function formatTimestamp(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
		return date.toLocaleDateString();
	}

	function getEventTypeIcon(eventType: string): string {
		if (eventType.includes('login')) return 'mdi:login';
		if (eventType.includes('token')) return 'mdi:key';
		if (eventType.includes('user')) return 'mdi:account';
		if (eventType.includes('data')) return 'mdi:database';
		if (eventType.includes('security') || eventType.includes('unauthorized')) return 'mdi:shield-alert';
		return 'mdi:information';
	}

	onMount(() => {
		loadAuditData();
		startAutoRefresh();
	});

	onDestroy(() => {
		stopAutoRefresh();
	});

	// Restart refresh when settings change
	$effect(() => {
		if (autoRefresh && refreshInterval) {
			stopAutoRefresh();
			startAutoRefresh();
		}
	});
</script>

<BaseWidget
	{label}
	{theme}
	{icon}
	{size}
	{onSizeChange}
	{resizable}
	onCloseRequest={onRemove}
	showRefreshButton={true}
	refresh={loadAuditData}
	{isLoading}
	{error}
>
	{#snippet children()}
		<div class="audit-widget flex h-full flex-col">
			<!-- Statistics Overview (Admin Only) -->
			{#if canViewSystemLogs && auditStats}
				<div class="stats-overview mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
					<div class="stat-card rounded border bg-blue-50 p-2">
						<div class="font-semibold text-blue-800">Total Events</div>
						<div class="text-lg text-blue-600">{auditStats.totalEvents}</div>
					</div>
					<div class="stat-card rounded border bg-red-50 p-2">
						<div class="font-semibold text-red-800">Critical</div>
						<div class="text-lg text-red-600">{auditStats.eventsBySeverity.critical}</div>
					</div>
					<div class="stat-card rounded border bg-orange-50 p-2">
						<div class="font-semibold text-orange-800">High</div>
						<div class="text-lg text-orange-600">{auditStats.eventsBySeverity.high}</div>
					</div>
					<div class="stat-card rounded border bg-green-50 p-2">
						<div class="font-semibold text-green-800">Success Rate</div>
						<div class="text-lg text-green-600">
							{auditStats.totalEvents > 0 ? Math.round((auditStats.eventsByResult.success / auditStats.totalEvents) * 100) : 0}%
						</div>
					</div>
				</div>
			{/if}

			<!-- Suspicious Activities Alert (Admin Only) -->
			{#if canViewSystemLogs && suspiciousEvents.length > 0}
				<div class="suspicious-alert mb-3 rounded border border-red-200 bg-red-50 p-2">
					<div class="flex items-center gap-2 text-sm font-semibold text-red-800">
						<iconify-icon icon="mdi:alert-circle" class="text-red-600"></iconify-icon>
						{suspiciousEvents.length} Suspicious Activities Detected
					</div>
				</div>
			{/if}

			<!-- Filter Tabs -->
			<div class="filter-tabs mb-3 flex gap-1 text-xs">
				<button
					class="rounded px-2 py-1 {selectedFilter === 'all' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'}"
					onclick={() => (selectedFilter = 'all')}
				>
					All Events
				</button>
				<button
					class="rounded px-2 py-1 {selectedFilter === 'security' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'}"
					onclick={() => (selectedFilter = 'security')}
				>
					Security
				</button>
				<button
					class="rounded px-2 py-1 {selectedFilter === 'auth' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'}"
					onclick={() => (selectedFilter = 'auth')}
				>
					Auth
				</button>
			</div>

			<!-- Recent Events List -->
			<div class="events-list flex-1 overflow-auto">
				<div class="mb-2 text-sm font-semibold text-gray-700">
					{canViewSystemLogs ? 'Recent System Events' : 'Your Recent Activity'}
				</div>

				{#if recentEvents.length === 0}
					<div class="py-4 text-center text-sm text-gray-500">No audit events found</div>
				{:else}
					<div class="space-y-2">
						{#each recentEvents.filter((event) => {
							if (selectedFilter === 'all') return true;
							if (selectedFilter === 'security') return ['unauthorized_access', 'privilege_escalation', 'data_breach_attempt', 'suspicious_activity'].includes(event.eventType);
							if (selectedFilter === 'auth') return event.eventType.includes('login') || event.eventType.includes('password') || event.eventType.includes('two_factor');
							return true;
						}) as event}
							<div class="event-item rounded border bg-white p-2 hover:bg-gray-50">
								<div class="flex items-start justify-between gap-2">
									<div class="flex min-w-0 flex-1 items-start gap-2">
										<iconify-icon icon={getEventTypeIcon(event.eventType)} class="mt-0.5 flex-shrink-0 text-gray-500"></iconify-icon>
										<div class="min-w-0 flex-1">
											<div class="truncate text-sm font-medium text-gray-900">
												{event.action}
											</div>
											<div class="flex items-center gap-2 text-xs text-gray-500">
												<span>{event.actorEmail || 'System'}</span>
												<span class="h-1 w-1 rounded-full bg-gray-300"></span>
												<span>{formatTimestamp(event.timestamp)}</span>
											</div>
										</div>
									</div>
									<div class="flex flex-shrink-0 items-center gap-1">
										<span class="rounded border px-1.5 py-0.5 text-xs {severityColors[event.severity]}">
											{event.severity}
										</span>
										<iconify-icon
											icon={event.result === 'success' ? 'mdi:check-circle' : event.result === 'failure' ? 'mdi:close-circle' : 'mdi:minus-circle'}
											class="text-sm {resultColors[event.result]}"
										></iconify-icon>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- View More Link -->
			{#if canViewSystemLogs}
				<div class="mt-3 text-center">
					<a href="/admin/audit" class="text-xs text-primary-600 underline hover:text-primary-800"> View Full Audit Dashboard → </a>
				</div>
			{:else}
				<div class="mt-3 text-center">
					<a href="/user/activity" class="text-xs text-primary-600 underline hover:text-primary-800"> View Full Activity Log → </a>
				</div>
			{/if}
		</div>
	{/snippet}
</BaseWidget>

<style>
	.audit-widget {
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	.stat-card {
		transition: all 0.2s ease;
	}

	.stat-card:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.event-item {
		transition: all 0.2s ease;
	}

	.filter-tabs button {
		transition: all 0.2s ease;
	}

	.filter-tabs button:hover {
		background-color: theme('colors.primary.50');
	}
</style>
