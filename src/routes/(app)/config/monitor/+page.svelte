<!--
@file src/routes/(app)/config/monitor/+page.svelte
@component Enterprise Monitor Dashboard
 -->
<script lang="ts">
import { fade, fly } from "svelte/transition";
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";

let { data } = $props();
const system = $derived(data.system as any);

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
</script>

<div class="p-6 space-y-8 bg-surface-50/50 dark:bg-surface-950/50 min-h-full">
    <!-- Header -->
    <div class="flex items-center justify-between" in:fade>
        <div>
            <h1 class="text-3xl font-bold flex items-center gap-3">
                <iconify-icon icon="mdi:shield-check-outline" class="text-primary-500"></iconify-icon>
                Enterprise Monitor
            </h1>
            <p class="text-sm opacity-50 font-medium">Unified Security & Health Command Center</p>
        </div>
        <div class="flex items-center gap-2">
            {#if isPolling}
                <div class="badge preset-tonal-primary text-[10px] animate-pulse">Syncing...</div>
            {/if}
            <div class="text-[10px] font-bold opacity-30 uppercase tracking-widest">v2026.4.11</div>
        </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Security Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 100 }}>
            <div class="flex items-center justify-between">
                <div class="bg-primary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:shield-lock" class="text-primary-500 text-2xl"></iconify-icon>
                </div>
                <span class="badge preset-filled-success-500">Stable</span>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Security Status</h3>
                <p class="text-3xl font-black">{data.security?.incidentCount || 0} Incidents</p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>Blocked IPs: <b class="text-error-500">{data.security?.blockedIpsCount || 0}</b></span>
                <span class="opacity-50">Last 24h</span>
            </div>
        </div>

        <!-- Trash Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 200 }}>
            <div class="flex items-center justify-between">
                <div class="bg-warning-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:trash-can-outline" class="text-warning-500 text-2xl"></iconify-icon>
                </div>
                <button class="btn btn-sm preset-tonal-warning">Empty</button>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Trash Recovery</h3>
                <p class="text-3xl font-black">{data.trash?.count || 0} Items</p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>Total Storage: <b class="text-warning-600">~12.4MB</b></span>
                <span class="opacity-50">30-day Retention</span>
            </div>
        </div>

        <!-- Webhooks Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 300 }}>
            <div class="flex items-center justify-between">
                <div class="bg-secondary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:webhook" class="text-secondary-500 text-2xl"></iconify-icon>
                </div>
                <div class="flex gap-1">
                    <div class="h-2 w-2 rounded-full bg-success-500 animate-ping"></div>
                    <span class="text-[10px] font-bold">Active</span>
                </div>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">Webhook Delivery</h3>
                <p class="text-3xl font-black">{data.webhooks?.active || 0} Endpoints</p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>Failures: <b class="text-error-500">{data.webhooks?.failures || 0}</b></span>
                <span class="opacity-50">Success Rate: 99.8%</span>
            </div>
        </div>

        <!-- System Card -->
        <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 400 }}>
            <div class="flex items-center justify-between">
                <div class="bg-tertiary-500/10 p-2 rounded-lg">
                    <iconify-icon icon="mdi:server-network" class="text-tertiary-500 text-2xl"></iconify-icon>
                </div>
                <span class="badge preset-filled-tertiary-500">Normal Load</span>
            </div>
            <div>
                <h3 class="text-sm font-bold opacity-40 uppercase tracking-widest">System Health</h3>
                <p class="text-3xl font-black">{(system as any)?.memoryUsage?.toFixed(1) || 0}% RAM</p>
            </div>
            <div class="pt-2 border-t border-surface-200 dark:border-surface-800 flex justify-between text-xs">
                <span>CPU: <b class="text-tertiary-600">{(system as any)?.cpuLoad?.toFixed(1) || 0}%</b></span>
                <span class="opacity-50">Uptime: 14d 2h</span>
            </div>
        </div>
    </div>

    <!-- Main Views Area -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Webhook Health & Details -->
        <div class="lg:col-span-2 card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm" in:fade={{ delay: 500 }}>
             <div class="flex items-center justify-between mb-6">
                <h2 class="text-lg font-bold">Security Incident Feed</h2>
                <button class="btn btn-sm variant-ghost-surface">View All Logs</button>
             </div>
             <div class="space-y-4">
                {#if data.security?.recentIncidents?.length > 0}
                    {#each data.security.recentIncidents as incident}
                        <div class="flex items-center gap-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border-l-4 border-error-500">
                            <iconify-icon icon="mdi:alert-decagram" class="text-error-500 text-xl"></iconify-icon>
                            <div class="flex-1">
                                <p class="text-sm font-bold">{incident.type}</p>
                                <p class="text-xs opacity-50">{incident.message}</p>
                            </div>
                            <span class="text-xs opacity-30">{new Date(incident.timestamp).toLocaleTimeString()}</span>
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

        <!-- Sidebar Components -->
        <div class="space-y-6" in:fade={{ delay: 600 }}>
            <!-- Quick Recovery -->
            <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm">
                <h2 class="text-lg font-bold mb-4">Quick Restore</h2>
                <div class="space-y-3">
                    <p class="text-xs opacity-50 mb-2 font-medium">Recently deleted items available for restoration.</p>
                    <button class="btn btn-sm preset-filled-primary-500 w-full justify-between">
                        <span>Open Trash Manager</span>
                        <iconify-icon icon="mdi:arrow-right"></iconify-icon>
                    </button>
                </div>
            </div>

            <!-- Webhook Health -->
            <div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm">
                <h2 class="text-lg font-bold mb-4">Webhook Status</h2>
                <div class="space-y-4">
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Active Hooks</span>
                        <span class="font-bold">{data.webhooks?.active || 0}</span>
                    </div>
                    <div class="h-1.5 w-full bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                        <div class="h-full bg-success-500" style="width: 100%"></div>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-50">Error Rate</span>
                        <span class="font-bold text-success-500">0.02%</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
