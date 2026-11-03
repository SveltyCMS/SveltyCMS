<!--
@file src/routes/(app)/config/monitor/+page.svelte
@component Unified Enterprise Monitor & System Health Dashboard
 -->
<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import {
		common_active,
		monitor_24h,
		monitor_active_hooks,
		monitor_all_secured,
		monitor_audit_details,
		monitor_audit_empty,
		monitor_audit_event,
		monitor_audit_hash,
		monitor_audit_result,
		monitor_audit_timestamp,
		monitor_audit_user,
		monitor_audit_trail,
		monitor_audit_trail_desc,
		monitor_avg,
		monitor_blocked,
		monitor_error_rate,
		monitor_errors,
		monitor_export_chain,
		monitor_failures,
		monitor_incidents,
		monitor_init_time,
		monitor_message,
		monitor_requests,
		monitor_security,
		monitor_security_feed,
		monitor_service,
		monitor_service_health,
		monitor_services,
		monitor_status,
		monitor_syncing,
		monitor_system,
		monitor_system_is,
		monitor_title,
		monitor_total,
		monitor_uptime,
		monitor_view_all_logs,
		monitor_webhook_status
	} from '@src/paraglide/messages';
	import { formatTime, formatDateTime } from '@utils/format-date';
	import { formatUptimeMs } from '@utils/format-uptime';

	let { data } = $props();
	const system = $derived(data.system as any);
	const systemState = $derived(data.systemState as any);
	const webhooks = $derived(data.webhooks as any);

	let isPolling = $state(false);

	onMount(() => {
		const interval = setInterval(() => {
			if (!isPolling) {
				isPolling = true;
				invalidate('app:monitor').finally(() => (isPolling = false));
			}
		}, 30000); // 30s poll

		return () => clearInterval(interval);
	});
</script>

<AdminPageShell
	title={monitor_title()}
	icon="mdi:shield-check-outline"
	showBackButton={true}
	backUrl="/config"
	spaceY="4"
>
	{#snippet actions()}
		{#if isPolling}
			<Badge
				preset="tonal"
				color="primary"
				size="sm"
				class="animate-pulse"
				data-testid="monitor-syncing">{monitor_syncing()}</Badge
			>
		{/if}
		<Badge
			preset="tonal"
			color={systemState?.overallState === 'READY' ? 'success' : 'warning'}
			size="sm"
			data-testid="monitor-overall-state"
		>
			{systemState?.overallState || 'Unknown'}
		</Badge>
	{/snippet}

	<div data-testid="monitor-page" class="contents">
		<!-- Stats Grid -->
		<div
			class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4"
			data-testid="monitor-stats"
		>
			<!-- Security Card -->
			<AdminCard
				class="space-y-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm backdrop-blur-md dark:bg-surface-900/50"
				data-testid="monitor-card-security"
			>
				<div class="flex items-center justify-between">
					<div
						class="flex size-10 items-center justify-center rounded bg-tertiary-500/10 dark:bg-primary-500/10"
					>
						<iconify-icon
							icon="mdi:shield-lock"
							class="text-2xl text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
					</div>
					<Badge variant="primary">{common_active()}</Badge>
				</div>
				<div>
					<h3 class="text-sm font-bold uppercase tracking-widest opacity-40">
						{monitor_security()}
					</h3>
					<p class="text-3xl font-black">
						{data.security?.incidentCount || 0}
						<span class="text-base font-normal opacity-50">{monitor_incidents()}</span>
					</p>
				</div>
				<div class="flex justify-between border-t border-(--admin-border-default) pt-2 text-xs">
					<span
						>{monitor_blocked()}
						<b class="text-error-500">{data.security?.blockedIpsCount || 0}</b></span
					>
					<span class="opacity-50">{monitor_24h()}</span>
				</div>
			</AdminCard>

			<!-- System State Card -->
			<AdminCard
				class="space-y-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm backdrop-blur-md dark:bg-surface-900/50"
				data-testid="monitor-card-system"
			>
				<div class="flex items-center justify-between">
					<div class="flex size-10 items-center justify-center rounded bg-tertiary-500/10">
						<iconify-icon icon="mdi:server-network" class="text-2xl text-tertiary-500"
						></iconify-icon>
					</div>
					<Badge variant={systemState?.overallState === 'READY' ? 'success' : 'warning'}
						>{systemState?.overallState || 'Unknown'}</Badge
					>
				</div>
				<div>
					<h3 class="text-sm font-bold uppercase tracking-widest opacity-40">{monitor_system()}</h3>
					<p class="text-3xl font-black" data-testid="monitor-uptime">
						{formatUptimeMs(system?.uptime ?? 0)}
						<span class="text-base font-normal opacity-50">{monitor_uptime()}</span>
					</p>
				</div>
				<div class="flex justify-between border-t border-(--admin-border-default) pt-2 text-xs">
					<span>{monitor_services()} <b>{systemState?.services?.length ?? 0}</b></span>
					<span class="opacity-50"
						>{monitor_avg()}
						{system?.requests?.avgResponseTime != null
							? `${Math.round(system.requests.avgResponseTime)}ms`
							: 'N/A'}</span
					>
				</div>
			</AdminCard>

			<!-- API Traffic Card -->
			<AdminCard
				class="space-y-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm backdrop-blur-md dark:bg-surface-900/50"
				data-testid="monitor-card-requests"
			>
				<div class="flex items-center justify-between">
					<div class="flex size-10 items-center justify-center rounded bg-tertiary-500/10">
						<iconify-icon icon="mdi:chart-line" class="text-2xl text-tertiary-500"></iconify-icon>
					</div>
					<Badge preset="tonal" color="surface" size="sm">API</Badge>
				</div>
				<div>
					<h3 class="text-sm font-bold uppercase tracking-widest opacity-40">
						{monitor_requests()}
					</h3>
					<p class="text-3xl font-black">
						{system?.requests?.total ?? 0}
						<span class="text-base font-normal opacity-50">{monitor_total()}</span>
					</p>
				</div>
				<div class="flex justify-between border-t border-(--admin-border-default) pt-2 text-xs">
					<span
						>{monitor_errors()} <b class="text-error-500">{system?.requests?.errors ?? 0}</b></span
					>
					<span class="opacity-50"
						>{system?.requests?.errorRate != null
							? `${system.requests.errorRate.toFixed(1)}%`
							: 'N/A'}</span
					>
				</div>
			</AdminCard>

			<!-- Background Worker / Queue Card -->
			<AdminCard
				class="space-y-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm backdrop-blur-md dark:bg-surface-900/50"
				data-testid="monitor-card-actions"
			>
				<div class="flex items-center justify-between">
					<div
						class="flex size-10 items-center justify-center rounded bg-tertiary-500/10 dark:bg-primary-500/10"
					>
						<iconify-icon
							icon="mdi:tray-full"
							class="text-2xl text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
					</div>
					<Badge preset="tonal" color="primary" size="sm">Queue</Badge>
				</div>
				<div>
					<h3 class="text-sm font-bold uppercase tracking-widest opacity-40">Background Tasks</h3>
					<p class="text-3xl font-black">
						{webhooks?.active ?? 0}
						<span class="text-base font-normal opacity-50">Webhooks Active</span>
					</p>
				</div>
				<div class="space-y-2 border-t border-(--admin-border-default) pt-2">
					<Button
						variant="tertiary"
						size="sm"
						href="/config/queue"
						class="w-full justify-between"
						data-sveltekit-preload-data="hover"
						data-preload="hover"
						data-testid="monitor-link-queue"
					>
						<span>View Background Queue</span>
						<iconify-icon icon="mdi:arrow-right"></iconify-icon>
					</Button>
				</div>
			</AdminCard>
		</div>

		<!-- Service Health Table -->
		<AdminCard
			class="border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm dark:bg-surface-900"
			data-testid="monitor-service-health"
		>
			<h2 class="mb-4 text-lg font-bold">{monitor_service_health()}</h2>
			{#if systemState?.services?.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-surface-500/30 text-start dark:border-surface-500/40">
								<th class="pb-2 text-xs font-bold uppercase opacity-50">{monitor_service()}</th>
								<th class="pb-2 text-xs font-bold uppercase opacity-50">{monitor_status()}</th>
								<th class="hidden pb-2 text-xs font-bold uppercase opacity-50 sm:table-cell"
									>{monitor_init_time()}</th
								>
								<th class="hidden pb-2 text-xs font-bold uppercase opacity-50 md:table-cell"
									>{monitor_failures()}</th
								>
								<th class="hidden pb-2 text-xs font-bold uppercase opacity-50 lg:table-cell"
									>{monitor_message()}</th
								>
							</tr>
						</thead>
						<tbody>
							{#each systemState.services as svc (svc.name)}
								<tr class="border-b border-surface-100 dark:border-surface-500/40">
									<td class="py-2 font-medium">{svc.name}</td>
									<td class="py-2">
										<Badge
											size="sm"
											variant={svc.status === 'healthy'
												? 'primary'
												: svc.status === 'degraded'
													? 'warning'
													: svc.status === 'initializing'
														? 'tertiary'
														: 'error'}
											preset={svc.status === 'initializing' ? 'tonal' : undefined}
											color={svc.status === 'initializing' ? 'primary' : undefined}
										>
											{svc.status}
										</Badge>
									</td>
									<td class="hidden py-2 opacity-50 sm:table-cell"
										>{svc.initDuration != null ? svc.initDuration + 'ms' : '--'}</td
									>
									<td class="hidden py-2 md:table-cell">{svc.failures > 0 ? svc.failures : '0'}</td>
									<td class="max-w-50 truncate py-2 text-xs opacity-50 lg:table-cell"
										>{svc.message || '--'}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-sm italic opacity-50">
					{monitor_system_is()}
					{systemState?.overallState || 'starting'}.
				</p>
			{/if}
		</AdminCard>

		<!-- Security Feed & Webhooks Sidebar -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<AdminCard
				class="border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm lg:col-span-2 dark:bg-surface-900"
			>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-base font-bold">{monitor_security_feed()}</h2>
					<Button variant="ghost" size="sm">{monitor_view_all_logs()}</Button>
				</div>
				<div class="space-y-3">
					{#if data.security?.recentIncidents?.length > 0}
						{#each data.security.recentIncidents as incident (incident._id)}
							{const inc = incident as any}
							<div
								class="flex items-center gap-3 rounded border-s-4 border-error-500 bg-surface-500/10 p-3 dark:bg-surface-800"
							>
								<iconify-icon icon="mdi:alert-decagram" class="text-xl text-error-500"
								></iconify-icon>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-bold truncate">{inc.type}</p>
									<p class="text-xs opacity-50 truncate">{inc.message}</p>
								</div>
								<span class="text-xs opacity-30 shrink-0">{formatTime(inc.timestamp)}</span>
							</div>
						{/each}
					{:else}
						<div class="py-8 text-center italic opacity-30">
							<iconify-icon icon="mdi:shield-check" width="40" class="mb-1"></iconify-icon>
							<p class="text-xs">{monitor_all_secured()}</p>
						</div>
					{/if}
				</div>
			</AdminCard>

			<div class="space-y-6">
				<AdminCard
					class="border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm dark:bg-surface-900"
				>
					<h2 class="mb-3 text-base font-bold">{monitor_webhook_status()}</h2>
					<div class="space-y-3">
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-50">{monitor_active_hooks()}</span>
							<span class="font-bold">{webhooks?.active || 0}</span>
						</div>
						<div
							class="h-1.5 w-full overflow-hidden rounded-full bg-surface-500/10 dark:bg-surface-800"
						>
							<div
								class="h-full bg-success-500"
								style="width: {webhooks?.total > 0 ? 100 : 0}%"
							></div>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-50">{monitor_error_rate()}</span>
							<span class="font-bold text-tertiary-500 dark:text-primary-500"
								>{webhooks?.total > 0 ? '0%' : 'N/A'}</span
							>
						</div>
					</div>
				</AdminCard>
			</div>
		</div>

		<!-- Cryptographic Audit Logs -->
		<AdminCard
			class="border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) p-4 sm:p-5 shadow-sm dark:bg-surface-900"
		>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-base font-bold">{monitor_audit_trail()}</h2>
					<p class="text-xs text-surface-500 dark:text-surface-400">
						{monitor_audit_trail_desc()}
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => window.open('/api/logs/download?type=latest&format=text', '_blank')}
					>{monitor_export_chain()}</Button
				>
			</div>

			{#if data.auditLogs && data.auditLogs.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full text-sm text-start border-collapse table-auto">
						<thead>
							<tr
								class="border-b border-surface-500/30 text-start dark:border-surface-500/40 opacity-50 text-xs font-bold uppercase"
							>
								<th class="pb-2 text-start">{monitor_audit_timestamp()}</th>
								<th class="pb-2 text-start">{monitor_audit_user()}</th>
								<th class="pb-2 text-start">{monitor_audit_event()}</th>
								<th class="pb-2 text-start">{monitor_audit_result()}</th>
								<th class="pb-2 text-start hidden md:table-cell">{monitor_audit_details()}</th>
								<th class="pb-2 text-end hidden lg:table-cell">{monitor_audit_hash()}</th>
							</tr>
						</thead>
						<tbody>
							{#each data.auditLogs as log (log._id)}
								<tr
									class="border-b border-surface-100 dark:border-surface-500/40 text-xs hover:bg-surface-500/10 dark:hover:bg-surface-850"
								>
									<td class="py-2.5 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
									<td class="py-2.5 whitespace-nowrap font-medium">{log.actorEmail || 'system'}</td>
									<td class="py-2.5 whitespace-nowrap">
										<span
											class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-tertiary-500/10 text-tertiary-600 dark:text-primary-500"
										>
											{log.eventType}
										</span>
									</td>
									<td class="py-2.5 whitespace-nowrap">
										<Badge size="sm" variant={log.result === 'success' ? 'primary' : 'error'}>
											{log.result}
										</Badge>
									</td>
									<td class="py-2.5 max-w-xs truncate hidden md:table-cell opacity-70">
										{JSON.stringify(log.details)}
									</td>
									<td class="py-2.5 text-end font-mono hidden lg:table-cell text-xs opacity-40">
										{log.hash ? log.hash.substring(0, 12) + '...' : '--'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="py-8 text-center italic opacity-35">
					<iconify-icon icon="mdi:script-text-outline" width="32" class="mb-2"></iconify-icon>
					<p>{monitor_audit_empty()}</p>
				</div>
			{/if}
		</AdminCard>
	</div>
</AdminPageShell>
