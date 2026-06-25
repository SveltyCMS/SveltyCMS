<!--
@file src/routes/(app)/config/monitor/+page.svelte
@component Unified Enterprise Monitor & System Health Dashboard
 -->
<script lang="ts">
import AdminPageShell from "@components/admin-page-shell.svelte";
import AdminCard from '@components/admin-card.svelte';
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';

let { data } = $props();
const system = $derived(data.system as any);
const systemState = $derived(data.systemState as any);
const webhooks = $derived(data.webhooks as any);

let isPolling = $state(false);

onMount(() => {
    const interval = setInterval(() => {
        if (!isPolling) {
            isPolling = true;
            invalidate('app:monitor').finally(() => isPolling = false);
        }
    }, 30000); // 30s poll

    return () => clearInterval(interval);
});

// Format uptime from seconds
function formatUptime(seconds: number): string {
    if (!seconds || seconds < 0) return "Just started";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.length > 0 ? parts.join(" ") : "< 1m";
}
</script>

<AdminPageShell
	title="Enterprise Monitor"
	icon="mdi:shield-check-outline"
	showBackButton={true}
	backUrl="/config"
	spaceY="4"
>
	{#snippet actions()}
		{#if isPolling}
			<Badge preset="tonal" color="primary" size="sm" class="animate-pulse">Syncing...</Badge>
		{/if}
		<Badge preset="tonal" color={systemState?.overallState === 'READY' ? 'success' : 'warning'} size="sm">
			{systemState?.overallState || 'Unknown'}
		</Badge>
	{/snippet}

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <!-- Security Card -->
        <AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
            <div class="flex items-center justify-between">
                <div class="rounded bg-tertiary-500 p-2 dark:bg-primary-500/10">
                    <iconify-icon icon="mdi:shield-lock" class="text-2xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
                </div>
                <Badge variant="primary">Active</Badge>
            </div>
            <div>
                <h3 class="text-sm font-bold uppercase tracking-widest opacity-40">Security</h3>
                <p class="text-3xl font-black">{data.security?.incidentCount || 0} <span class="text-base font-normal opacity-50">Incidents</span></p>
            </div>
            <div class="flex justify-between border-t border-surface-200 pt-2 text-xs dark:border-surface-800">
                <span>Blocked: <b class="text-error-500">{data.security?.blockedIpsCount || 0}</b></span>
                <span class="opacity-50">24h</span>
            </div>
        </AdminCard>

        <!-- System State Card -->
        <AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
            <div class="flex items-center justify-between">
                <div class="rounded bg-tertiary-500/10 p-2">
                    <iconify-icon icon="mdi:server-network" class="text-2xl text-tertiary-500"></iconify-icon>
                </div>
                <Badge variant={systemState?.overallState === 'READY' ? 'success' : 'warning'}>{systemState?.overallState || 'Unknown'}</Badge>
            </div>
            <div>
                <h3 class="text-sm font-bold uppercase tracking-widest opacity-40">System</h3>
                <p class="text-3xl font-black">{formatUptime(system?.uptime ?? 0)} <span class="text-base font-normal opacity-50">Uptime</span></p>
            </div>
            <div class="flex justify-between border-t border-surface-200 pt-2 text-xs dark:border-surface-800">
                <span>Services: <b>{systemState?.services?.length ?? 0}</b></span>
                <span class="opacity-50">Avg: {system?.requests?.avgResponseTime != null ? `${Math.round(system.requests.avgResponseTime)}ms` : 'N/A'}</span>
            </div>
        </AdminCard>

        <!-- API Traffic Card -->
        <AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
            <div class="flex items-center justify-between">
                <div class="rounded bg-tertiary-500/10 p-2">
                    <iconify-icon icon="mdi:chart-line" class="text-2xl text-tertiary-500"></iconify-icon>
                </div>
                <Badge preset="tonal" color="surface" size="sm">API</Badge>
            </div>
            <div>
                <h3 class="text-sm font-bold uppercase tracking-widest opacity-40">Requests</h3>
                <p class="text-3xl font-black">{system?.requests?.total ?? 0} <span class="text-base font-normal opacity-50">Total</span></p>
            </div>
            <div class="flex justify-between border-t border-surface-200 pt-2 text-xs dark:border-surface-800">
                <span>Errors: <b class="text-error-500">{system?.requests?.errors ?? 0}</b></span>
                <span class="opacity-50">{system?.requests?.errorRate != null ? `${system.requests.errorRate.toFixed(1)}%` : 'N/A'}</span>
            </div>
        </AdminCard>

        <!-- Quick Actions Card -->
        <AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
            <div class="flex items-center justify-between">
                <div class="rounded bg-tertiary-500/10 p-2">
                    <iconify-icon icon="mdi:lightning-bolt" class="text-2xl text-tertiary-500"></iconify-icon>
                </div>
                <Badge preset="tonal" color="primary" size="sm">Actions</Badge>
            </div>
            <div>
                <h3 class="text-sm font-bold uppercase tracking-widest opacity-40">Quick Links</h3>
                <p class="text-sm opacity-60">Jump to common admin tools</p>
            </div>
            <div class="space-y-2 border-t border-surface-200 pt-2 dark:border-surface-800">
                <Button variant="tertiary" size="sm" href="/config/system-settings" class="w-full justify-between" data-sveltekit-preload-data="hover">
                    <span>System Settings</span>
                    <iconify-icon icon="mdi:arrow-right"></iconify-icon>
                </Button>
                <Button variant="tertiary" size="sm" href="/config/collectionbuilder" class="w-full justify-between" data-sveltekit-preload-data="hover">
                    <span>Collection Builder</span>
                    <iconify-icon icon="mdi:arrow-right"></iconify-icon>
                </Button>
            </div>
        </AdminCard>
    </div>

    <!-- Service Health Table -->
    <AdminCard class="border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <h2 class="mb-4 text-lg font-bold">Service Health</h2>
        {#if systemState?.services?.length > 0}
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-surface-200 text-start dark:border-surface-700">
                            <th class="pb-2 text-xs font-bold uppercase opacity-50">Service</th>
                            <th class="pb-2 text-xs font-bold uppercase opacity-50">Status</th>
                            <th class="hidden pb-2 text-xs font-bold uppercase opacity-50 sm:table-cell">Init Time</th>
                            <th class="hidden pb-2 text-xs font-bold uppercase opacity-50 md:table-cell">Failures</th>
                            <th class="hidden pb-2 text-xs font-bold uppercase opacity-50 lg:table-cell">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each systemState.services as svc (svc.name)}
                            <tr class="border-b border-surface-100 dark:border-surface-800">
                                <td class="py-2 font-medium">{svc.name}</td>
                                <td class="py-2">
                                    <Badge
                                        size="sm"
                                        variant={svc.status === 'healthy' ? 'primary' : svc.status === 'degraded' ? 'warning' : svc.status === 'initializing' ? 'tertiary' : 'error'}
                                        preset={svc.status === 'initializing' ? 'tonal' : undefined}
                                        color={svc.status === 'initializing' ? 'primary' : undefined}
                                    >
                                        {svc.status}
                                    </Badge>
                                </td>
                                <td class="hidden py-2 opacity-50 sm:table-cell">{svc.initDuration != null ? svc.initDuration + 'ms' : '--'}</td>
                                <td class="hidden py-2 md:table-cell">{svc.failures > 0 ? svc.failures : '0'}</td>
                                <td class="max-w-50 truncate py-2 text-xs opacity-50 lg:table-cell">{svc.message || '--'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <p class="text-sm italic opacity-50">System is {systemState?.overallState || 'starting'}.</p>
        {/if}
    </AdminCard>

    <!-- Security Feed & Webhooks Sidebar -->
    <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <AdminCard class="border border-surface-200 bg-white p-6 shadow-sm lg:col-span-2 dark:border-surface-800 dark:bg-surface-900">
             <div class="mb-6 flex items-center justify-between">
                <h2 class="text-lg font-bold">Security Incident Feed</h2>
                <Button variant="ghost" size="sm">View All Logs</Button>
             </div>
             <div class="space-y-4">
                {#if data.security?.recentIncidents?.length > 0}
                    {#each data.security.recentIncidents as incident (incident._id)}
                        {const inc = incident as any}
                        <div class="flex items-center gap-4 rounded border-s-4 border-error-500 bg-surface-50 p-3 dark:bg-surface-800">
                            <iconify-icon icon="mdi:alert-decagram" class="text-xl text-error-500"></iconify-icon>
                            <div class="flex-1">
                                <p class="text-sm font-bold">{inc.type}</p>
                                <p class="text-xs opacity-50">{inc.message}</p>
                            </div>
                            <span class="text-xs opacity-30">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                        </div>
                    {/each}
                {:else}
                    <div class="py-12 text-center italic opacity-30">
                        <iconify-icon icon="mdi:shield-check" width="48" class="mb-2"></iconify-icon>
                        <p>All systems secured. No recent incidents.</p>
                    </div>
                {/if}
             </div>
        </AdminCard>

        <div class="space-y-6">
            <AdminCard class="border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
                <h2 class="mb-4 text-lg font-bold">Webhook Status</h2>
                <div class="space-y-4">
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Active Hooks</span>
                        <span class="font-bold">{webhooks?.active || 0}</span>
                    </div>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                        <div class="h-full bg-success-500" style="width: {webhooks?.total > 0 ? 100 : 0}%"></div>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Error Rate</span>
                        <span class="font-bold text-tertiary-500 dark:text-primary-500">{webhooks?.total > 0 ? '0%' : 'N/A'}</span>
                    </div>
                </div>
            </AdminCard>
        </div>
    </div>
</AdminPageShell>
