<!--
@file src/routes/(app)/config/monitor/+page.svelte
@component Unified Enterprise Monitor & System Health Dashboard
 -->
<script lang="ts">
import PageTitle from "@src/components/page-title.svelte";
import { fade, fly } from "svelte/transition";
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";

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

<div class="absolute inset-0 p-4 space-y-5 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
    <!-- Header -->
    <PageTitle name="Enterprise Monitor" icon="mdi:shield-check-outline" showBackButton={true} backUrl="/config">
        {#if isPolling}
            <div class="badge preset-tonal-primary text-[10px] animate-pulse">Syncing...</div>
        {/if}
        <span class="badge preset-tonal-{systemState?.overallState === 'READY' ? 'success' : 'warning'}-500 text-[10px]">
            {systemState?.overallState || 'Unknown'}
        </span>
    </PageTitle>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Security Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 100 }}>
            <div class="flex items-center justify-between">
                <div class="bg-primary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:shield-lock" class="text-primary-500 text-2xl"></iconify-icon>
                </div>
                <span class="badge preset-filled-primary-500">Active</span>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Security</h3>
                <p class="text-3xl font-black">{data.security?.incidentCount || 0} <span class="text-base font-normal opacity-50">Incidents</span></p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>Blocked: <b class="text-error-500">{data.security?.blockedIpsCount || 0}</b></span>
                <span class="opacity-50">24h</span>
            </div>
        </div>

        <!-- System State Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 200 }}>
            <div class="flex items-center justify-between">
                <div class="bg-tertiary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:server-network" class="text-tertiary-500 text-2xl"></iconify-icon>
                </div>
                <span class="badge preset-filled-tertiary-500">{systemState?.services?.length || 0} Services</span>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">System</h3>
                <p class="text-3xl font-black">{system?.memoryUsage != null ? system.memoryUsage.toFixed(0) : '--'}<span class="text-base font-normal opacity-50">% RAM</span></p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>CPU: <b class="text-tertiary-600">{system?.cpuLoad != null ? system.cpuLoad.toFixed(0) : '--'}%</b></span>
                <span class="opacity-50">Uptime: {formatUptime(system?.uptime || 0)}</span>
            </div>
        </div>

        <!-- Webhooks Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 300 }}>
            <div class="flex items-center justify-between">
                <div class="bg-secondary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:webhook" class="text-secondary-500 text-2xl"></iconify-icon>
                </div>
                <div class="flex gap-1 items-center">
                    <div class="h-2 w-2 rounded-full bg-success-500"></div>
                    <span class="text-[10px] font-bold">{webhooks?.active || 0} Active</span>
                </div>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Webhooks</h3>
                <p class="text-3xl font-black">{webhooks?.total || 0} <span class="text-base font-normal opacity-50">Endpoints</span></p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>Failures: <b class="text-error-500">{webhooks?.failures || 0}</b></span>
                <span class="opacity-50">Total: {webhooks?.total || 0}</span>
            </div>
        </div>

        <!-- Quick Actions Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 400 }}>
            <div class="flex items-center justify-between">
                <div class="bg-warning-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:flash" class="text-warning-500 text-2xl"></iconify-icon>
                </div>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Quick Actions</h3>
            </div>
            <div class="space-y-2">
                <a href="/config/system-settings" class="btn btn-sm preset-tonal-surface-500 w-full justify-between" data-sveltekit-preload-data="hover">
                    <span>System Settings</span>
                    <iconify-icon icon="mdi:arrow-right"></iconify-icon>
                </a>
                <a href="/config/collectionbuilder" class="btn btn-sm preset-tonal-primary-500 w-full justify-between" data-sveltekit-preload-data="hover">
                    <span>Collection Builder</span>
                    <iconify-icon icon="mdi:arrow-right"></iconify-icon>
                </a>
            </div>
        </div>
    </div>

    <!-- Service Health Table -->
    <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm" in:fade={{ delay: 500 }}>
        <h2 class="text-lg font-bold mb-4">Service Health</h2>
        {#if systemState?.services?.length > 0}
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-surface-200 dark:border-surface-700 text-left">
                            <th class="pb-2 font-bold opacity-50 uppercase text-xs">Service</th>
                            <th class="pb-2 font-bold opacity-50 uppercase text-xs">Status</th>
                            <th class="pb-2 font-bold opacity-50 uppercase text-xs hidden sm:table-cell">Init Time</th>
                            <th class="pb-2 font-bold opacity-50 uppercase text-xs hidden md:table-cell">Failures</th>
                            <th class="pb-2 font-bold opacity-50 uppercase text-xs hidden lg:table-cell">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each systemState.services as svc}
                            <tr class="border-b border-surface-100 dark:border-surface-800">
                                <td class="py-2 font-medium">{svc.name}</td>
                                <td class="py-2">
                                    <span class="badge text-[10px] {svc.status === 'healthy' ? 'preset-filled-primary-500' : svc.status === 'degraded' ? 'preset-filled-warning-500' : svc.status === 'initializing' ? 'preset-tonal-primary-500' : 'preset-filled-error-500'}">
                                        {svc.status}
                                    </span>
                                </td>
                                <td class="py-2 opacity-50 hidden sm:table-cell">{svc.initDuration != null ? svc.initDuration + 'ms' : '--'}</td>
                                <td class="py-2 hidden md:table-cell">{svc.failures > 0 ? svc.failures : '0'}</td>
                                <td class="py-2 opacity-50 text-xs hidden lg:table-cell max-w-50 truncate">{svc.message || '--'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <p class="text-sm opacity-50 italic">System is {systemState?.overallState || 'starting'}.</p>
        {/if}
    </div>

    <!-- Security Feed & Webhooks Sidebar -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm" in:fade={{ delay: 600 }}>
             <div class="flex items-center justify-between mb-6">
                <h2 class="text-lg font-bold">Security Incident Feed</h2>
                <button class="btn btn-sm variant-ghost-surface">View All Logs</button>
             </div>
             <div class="space-y-4">
                {#if data.security?.recentIncidents?.length > 0}
                    {#each data.security.recentIncidents as incident}
                        {@const inc = incident as any}
                        <div class="flex items-center gap-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border-l-4 border-error-500">
                            <iconify-icon icon="mdi:alert-decagram" class="text-error-500 text-xl"></iconify-icon>
                            <div class="flex-1">
                                <p class="text-sm font-bold">{inc.type}</p>
                                <p class="text-xs opacity-50">{inc.message}</p>
                            </div>
                            <span class="text-xs opacity-30">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                        </div>
                    {/each}
                {:else}
                    <div class="py-12 text-center opacity-30 italic">
                        <iconify-icon icon="mdi:shield-check" width="48" class="mb-2"></iconify-icon>
                        <p>All systems secured. No recent incidents.</p>
                    </div>
                {/if}
             </div>
        </div>

        <div class="space-y-6" in:fade={{ delay: 700 }}>
            <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm">
                <h2 class="text-lg font-bold mb-4">Webhook Status</h2>
                <div class="space-y-4">
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Active Hooks</span>
                        <span class="font-bold">{webhooks?.active || 0}</span>
                    </div>
                    <div class="h-1.5 w-full bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                        <div class="h-full bg-success-500" style="width: {webhooks?.total > 0 ? 100 : 0}%"></div>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Error Rate</span>
                        <span class="font-bold text-primary-500">{webhooks?.total > 0 ? '0%' : 'N/A'}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
