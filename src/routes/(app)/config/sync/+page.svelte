<!--
@files src/routes/(app)/config/sync/+page.svelte
@component
**Configuration Sync & Backup Manager**
Allows synchronization between filesystem and database, and full system backup/restore.
-->
<script lang="ts">
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import { fade, slide } from "svelte/transition";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Loader from '@components/ui/loader.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';

type ConfigStatus = {
	status: "in_sync" | "changes_detected" | "error";
	changes: {
		new?: { name: string; uuid: string; type: string }[];
		updated?: { name: string; uuid: string; type: string }[];
		deleted?: { name: string; uuid: string; type: string }[];
	};
	unmetRequirements: { name: string; type: string; requirement: string }[];
} | null;

let status: ConfigStatus = $state(null);
let isLoading = $state(true);
let isProcessing = $state(false);
let activeTab: "sync" | "backups" | "debug" = $state("sync");

const changeSummary = $derived(() => ({
	new: status?.changes?.new?.length || 0,
	updated: status?.changes?.updated?.length || 0,
	deleted: status?.changes?.deleted?.length || 0,
}));

async function loadStatus() {
	isLoading = true;
	try {
		const { fetchSyncStatus } = await import("./sync-api");
		const result = await fetchSyncStatus();
		if (!result.success) {
			throw new Error(result.message || "Failed to fetch status");
		}
		const payload = (result as { data?: ConfigStatus }).data ?? (result as unknown as ConfigStatus);
		status = payload && typeof payload === "object" && "status" in payload ? payload : (result as any);
		console.debug("[Config Sync] Received status:", $state.snapshot(status));
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		toast.error(`Failed to fetch status: ${errorMsg}`);
		status = null;
	} finally {
		isLoading = false;
	}
}

async function performSync() {
	if (!status || (status?.unmetRequirements?.length ?? 0) > 0) {
		toast.warning("Sync blocked due to unmet requirements.");
		return;
	}

	isProcessing = true;
	try {
		toast.info("Creating configuration promotion plan...");
		const { createSyncPlan, applySyncPlan } = await import("./sync-api");

		const planResult = await createSyncPlan("merge");
		if (!planResult.success) {
			throw new Error(planResult.message || "Plan failed");
		}
		const plan =
			(planResult as { data?: { planId?: string; mode?: string } }).data ??
			(planResult as { planId?: string; mode?: string });
		if (!plan?.planId) {
			throw new Error("Plan response did not include a planId.");
		}

		const applyResult = await applySyncPlan(plan.planId, plan.mode);
		if (!applyResult.success) {
			throw new Error(applyResult.message || "Apply failed");
		}
		const result =
			(applyResult as { data?: { message?: string } }).data ??
			(applyResult as { message?: string });
		toast.success(result.message || "Sync successful!");
		await loadStatus();
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		toast.error(`Sync failed: ${errorMsg}`);
	} finally {
		isProcessing = false;
	}
}

function syncAllChanges() {
	performSync();
}

onMount(() => {
	loadStatus();
});
</script>

<AdminPageShell
	title="Config Sync & Backup"
	icon="mdi:sync"
	description="Synchronize configuration between filesystem and database"
	showBackButton={true}
	backUrl="/config"
>
	<div data-testid="sync-page" class="contents">
	<AdminCard class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs">
		<div class="preset-tonal-surface mb-4 p-4">
			<p class="text-surface-600 dark:text-surface-300">
				Manage your system configuration. Use <strong>Sync</strong> to deploy code changes to the database, and <strong>Backups</strong> to import/export
				full system data.
			</p>
		</div>

		<div
			class="flex w-full overflow-x-auto border border-surface-300 bg-surface-100/70 dark:text-surface-50 dark:bg-surface-800/70"
			role="tablist"
			aria-label="Sync Options"
			data-testid="sync-tabs"
		>
			{#each ['sync', 'backups', 'debug'] as tab (tab)}
				<SystemTooltip
					title={tab === 'sync' ? 'Deploy changes' : tab === 'backups' ? 'Import/Export Data' : 'Debug Info'}
					positioning={{ placement: 'top' }}
				>
					<Button
						variant="ghost"
						class="flex-1 py-3 text-center text-sm font-medium {activeTab === tab
							? 'bg-tertiary-500! dark:bg-primary-500! text-white! dark:text-surface-900!'
							: 'text-surface-700! dark:text-surface-200!'}"
						onclick={() => (activeTab = tab as 'sync' | 'backups' | 'debug')}
						role="tab"
						aria-selected={activeTab === tab}
						aria-controls="{tab}-panel"
						id="{tab}-tab"
						data-testid={`sync-tab-${tab}`}
					>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</Button>
				</SystemTooltip>
			{/each}
		</div>

		<section transition:fade|local>
			{#if activeTab === 'sync'}
				{#if status?.unmetRequirements && status.unmetRequirements.length > 0}
					<div class="alert preset-filled-error-500 my-4 p-4" transition:slide>
						<h4 class="font-bold">Sync Blocked: Unmet Requirements</h4>
						<p class="text-sm">The following requirements must be met before you can import configuration:</p>
						<ul class="mt-2 list-disc ps-5 text-sm">
							{#each status.unmetRequirements as req (req.name + req.type)}
								<li><strong>{req.name}</strong> ({req.type}): {req.requirement}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="my-4">
					<Button variant="tertiary"
						disabled={isProcessing || !status || status.status === 'in_sync' || (status?.unmetRequirements?.length ?? 0) > 0}
						onclick={syncAllChanges}
						data-testid="sync-run"
					 class="w-full sm:w-auto" leadingIcon="mdi:sync">
						{isProcessing ? 'Syncing...' : 'Sync All Changes'}
					</Button>
				</div>

				{#if isLoading}
					<div class="flex flex-col items-center py-12 text-surface-500" data-testid="sync-loading">
						<Loader variant="text" lines={2} lastLineWidth="50%" ariaLabel="Checking synchronization status" />
						<Button variant="tertiary"
							onclick={loadStatus}
							disabled={isLoading}
							data-testid="sync-refresh"
						 class="mt-6 flex items-center gap-2" leadingIcon="mdi:refresh">
							{isLoading ? 'Checking...' : 'Refresh'}
						</Button>
					</div>
				{:else if status?.status === 'in_sync'}
					<div class="space-y-3 py-12 text-center" data-testid="sync-in-sync">
						<iconify-icon icon="mdi:check-circle" class="mx-auto text-6xl text-success-500"></iconify-icon>
						<h2 class="text-xl font-semibold">System is in Sync</h2>
						<p class="text-surface-500">Your database and filesystem configurations match perfectly.</p>
					</div>
				{:else}
					<div class="space-y-4" data-testid="sync-changes">
						<h3 class="flex items-center gap-2 text-lg font-semibold">
							<iconify-icon icon="mdi:alert" class="text-warning-500"></iconify-icon>
							Changes Detected
						</h3>
						<p class="">{changeSummary().new} new, {changeSummary().updated} updated, {changeSummary().deleted} deleted.</p>
						<AdminCard class="overflow-x-auto w-full border border-surface-200 dark:border-surface-800">
							<table class="w-full text-sm border-collapse">
								<thead>
									<tr class="border-b border-surface-200 dark:border-surface-800 text-start text-xs uppercase tracking-wider text-surface-400">
										<th class="px-4 py-3 font-semibold">Name</th>
										<th class="px-4 py-3 font-semibold">Type</th>
										<th class="px-4 py-3 font-semibold">Change</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
									{#each Object.entries(status?.changes || {}) as [changeType, items] (changeType)}
										{#each items as item (item.uuid || item.name)}
											<tr class="text-surface-700 dark:text-surface-200 hover:bg-surface-50/40 dark:hover:bg-surface-900/30">
												<td class="px-4 py-3">{item.name}</td>
												<td class="px-4 py-3">
													<Badge preset="tonal" color="surface" class="capitalize">{item.type}</Badge>
												</td>
												<td class="px-4 py-3">
													{#if changeType === 'new'}
														<Badge variant="tertiary" class="dark:preset-filled-primary-500">New</Badge>
													{/if}
													{#if changeType === 'updated'}
														<Badge variant="warning">Updated</Badge>
													{/if}
													{#if changeType === 'deleted'}
														<Badge variant="error">Deleted</Badge>
													{/if}
												</td>
											</tr>
										{/each}
									{/each}
								</tbody>
							</table>
						</AdminCard>
					</div>
				{/if}
			{/if}

			{#if activeTab === 'backups'}
				<div transition:slide|local class="space-y-4">
					<AdminCard class="p-8 text-center">
						<iconify-icon icon="mdi:database-export-outline" class="mx-auto text-5xl text-surface-400"></iconify-icon>
						<h3 class="mt-4 text-lg font-semibold">Backup & Import/Export</h3>
						<p class="mt-2 text-surface-500">Backup and content transfer functionality is available via the dedicated API endpoints.</p>
						<p class="mt-1 text-sm text-surface-400">Use the Smart Importer plugin for external data imports from WordPress, Drupal, CSV, and other formats.</p>
					</AdminCard>
				</div>
			{/if}

			{#if activeTab === 'debug'}
				<div transition:slide|local class="rounded border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900/40">
					<h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon icon="mdi:bug-outline"></iconify-icon> Raw API Response</h3>
					<pre
						class="whitespace-pre-wrap text-xs max-h-125 overflow-y-auto p-2 border border-surface-200 dark:border-surface-700 rounded bg-surface-100 dark:bg-surface-800">{JSON.stringify(
							status,
							null,
							2
						)}</pre>
				</div>
			{/if}
		</section>
	</AdminCard>
	</div>
</AdminPageShell>
