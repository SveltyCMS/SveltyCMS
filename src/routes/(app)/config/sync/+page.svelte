<!--
@file src/routes/(app)/config/sync/+page.svelte
@component
**Configuration Sync & Backup Manager**
Allows synchronization between filesystem and database, safety mode selection, and configuration export.

### Features:
- Real-time drift detection (New, Updated, Deleted)
- 4 Safety Modes: Merge, Add, Mirror, Replace
- One-click configuration export to filesystem
- Unmet requirement detection and safety gating
-->
<script lang="ts">
import { logger } from "@utils/logger";
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import { fade, slide } from "svelte/transition";
import Badge from "@components/ui/badge.svelte";
import Button from "@components/ui/button.svelte";
import Loader from "@components/ui/loader.svelte";
import AdminCard from "@components/admin-card.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";

type ConfigStatus = {
	status: "in_sync" | "changes_detected" | "error";
	changes: {
		new?: { name: string; uuid: string; type: string }[];
		updated?: { name: string; uuid: string; type: string }[];
		deleted?: { name: string; uuid: string; type: string }[];
	};
	unmetRequirements: { name: string; type: string; requirement: string }[];
} | null;

type SafetyMode = "merge" | "add" | "mirror" | "replace";

let status: ConfigStatus = $state(null);
let isLoading = $state(true);
let isProcessing = $state(false);
let isExporting = $state(false);
let activeTab: "sync" | "backups" | "debug" = $state("sync");
let selectedMode: SafetyMode = $state("merge");

const modeDescriptions: Record<SafetyMode, { label: string; description: string; badge: string }> = {
	merge: {
		label: "Merge (Recommended)",
		description: "Creates new entities and updates modified ones. Never deletes database records.",
		badge: "Safe",
	},
	add: {
		label: "Add Only",
		description: "Only creates missing entities. Never updates or deletes existing records.",
		badge: "Safest",
	},
	mirror: {
		label: "Mirror",
		description: "Matches filesystem exactly. Creates, updates, and deletes database records.",
		badge: "Destructive",
	},
	replace: {
		label: "Replace",
		description: "Drops all existing configuration and re-imports from filesystem.",
		badge: "High Risk",
	},
};

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
		logger.debug("[Config Sync] Received status:", $state.snapshot(status));
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

	if (selectedMode === "mirror" || selectedMode === "replace") {
		const confirmed = window.confirm(
			`Warning: "${selectedMode.toUpperCase()}" mode may delete existing configuration records in the database. Are you sure you want to proceed?`
		);
		if (!confirmed) return;
	}

	isProcessing = true;
	try {
		toast.info(`Creating configuration plan (${selectedMode} mode)...`);
		const { createSyncPlan, applySyncPlan } = await import("./sync-api");

		const planResult = await createSyncPlan(selectedMode);
		if (!planResult.success) {
			throw new Error(planResult.message || "Plan failed");
		}
		const plan =
			(planResult as { data?: { planId?: string; mode?: string } }).data ??
			(planResult as { planId?: string; mode?: string });
		if (!plan?.planId) {
			throw new Error("Plan response did not include a planId.");
		}

		const applyResult = await applySyncPlan(plan.planId, plan.mode || selectedMode);
		if (!applyResult.success) {
			throw new Error(applyResult.message || "Apply failed");
		}
		const result =
			(applyResult as { data?: { message?: string } }).data ??
			(applyResult as { message?: string });
		toast.success(result.message || "Configuration synchronized successfully!");
		await loadStatus();
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		toast.error(`Sync failed: ${errorMsg}`);
	} finally {
		isProcessing = false;
	}
}

async function exportCurrentConfig() {
	isExporting = true;
	try {
		toast.info("Exporting database configuration to filesystem...");
		const { exportConfig } = await import("./sync-api");
		const result = await exportConfig();
		if (!result.success) {
			throw new Error(result.message || "Export failed");
		}
		const data = (result as { data?: { dirPath?: string } }).data ?? (result as { dirPath?: string });
		toast.success(`Export complete! Saved to ${data?.dirPath || "config/sync/"}`);
		await loadStatus();
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		toast.error(`Export failed: ${errorMsg}`);
	} finally {
		isExporting = false;
	}
}

onMount(() => {
	loadStatus();
});
</script>

<AdminPageShell
	title="Config Sync & Backup"
	icon="mdi:sync"
	description="Synchronize configuration between filesystem and database (Schema as Code)"
	showBackButton={true}
	backUrl="/config"
>
	<div data-testid="sync-page" class="contents">
		<AdminCard class="p-6 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs">
			<div class="preset-tonal-surface mb-4 p-4 rounded-md">
				<p class="text-surface-600 dark:text-surface-400 text-sm">
					Manage your system configuration using <strong>Schema as Code</strong>. Deploy filesystem changes to the active database, or export the active configuration to <code>config/sync/</code> for version control.
				</p>
			</div>

			<div
				class="flex w-full overflow-x-auto border border-surface-500/30 rounded-md bg-surface-500/10 dark:text-surface-50 dark:bg-surface-800/70 mb-6"
				role="tablist"
				aria-label="Sync Options"
				data-testid="sync-tabs"
			>
				{#each ['sync', 'backups', 'debug'] as tab (tab)}
					<SystemTooltip
						title={tab === 'sync' ? 'Deploy & Export Changes' : tab === 'backups' ? 'Import/Export Data' : 'Debug Info'}
						positioning={{ placement: 'top' }}
					>
						<Button
							variant="ghost"
							class="flex-1 py-3 text-center text-sm font-medium {activeTab === tab
								? 'bg-tertiary-500! dark:bg-primary-500! text-white! dark:text-surface-900!'
								: 'text-surface-600! dark:text-surface-400!'}"
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
						<div class="alert preset-filled-error-500 my-4 p-4 rounded-md" transition:slide>
							<h4 class="font-bold flex items-center gap-2">
								<iconify-icon icon="mdi:alert-circle"></iconify-icon>
								Sync Blocked: Unmet Requirements
							</h4>
							<p class="text-sm mt-1">The following requirements must be satisfied before importing configuration:</p>
							<ul class="mt-2 list-disc ps-5 text-sm">
								{#each status.unmetRequirements as req (req.name + req.type)}
									<li><strong>{req.name}</strong> ({req.type}): {req.requirement}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Action Controls -->
					<div class="my-6 p-4 rounded-lg border border-surface-500/30 dark:border-surface-500/40 bg-surface-500/50 dark:bg-surface-900/20 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
						<!-- Safety Mode Selector -->
						<div class="flex flex-col gap-1.5 w-full md:w-auto">
							<label for="safety-mode-select" class="text-xs font-semibold uppercase tracking-wider text-surface-500">
								Promotion Safety Mode
							</label>
							<div class="flex items-center gap-2">
								<select id="safety-mode-select" aria-label="Promotion safety mode"
									bind:value={selectedMode}
									class="px-3 py-1.5 text-sm rounded-md border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 focus:ring-2 focus:ring-primary-500 focus:outline-hidden"
								>
									{#each (['merge', 'add', 'mirror', 'replace'] as const) as mode (mode)}
										<option value={mode}>{modeDescriptions[mode].label}</option>
									{/each}
								</select>
								<Badge
									variant={selectedMode === 'merge' ? 'tertiary' : selectedMode === 'add' ? 'surface' : selectedMode === 'mirror' ? 'warning' : 'error'}
									class="text-xs"
								>
									{modeDescriptions[selectedMode].badge}
								</Badge>
							</div>
							<p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
								{modeDescriptions[selectedMode].description}
							</p>
						</div>

						<!-- Action Buttons -->
						<div class="flex flex-wrap gap-2 w-full md:w-auto justify-end">
							<Button
								variant="ghost"
								disabled={isExporting || isLoading}
								onclick={exportCurrentConfig}
								data-testid="config-export-btn"
								leadingIcon="mdi:export"
							>
								{isExporting ? 'Exporting...' : 'Export to Filesystem'}
							</Button>

							<Button
								variant="ghost"
								disabled={isLoading || isProcessing}
								onclick={loadStatus}
								data-testid="sync-refresh"
								leadingIcon="mdi:refresh"
							>
								{isLoading ? 'Checking...' : 'Refresh'}
							</Button>

							<Button
								variant="tertiary"
								disabled={isProcessing || !status || status.status === 'in_sync' || (status?.unmetRequirements?.length ?? 0) > 0}
								onclick={performSync}
								data-testid="sync-run"
								leadingIcon="mdi:sync"
							>
								{isProcessing ? 'Syncing...' : 'Apply Changes'}
							</Button>
						</div>
					</div>

					{#if isLoading}
						<div class="flex flex-col items-center py-12 text-surface-500" data-testid="sync-loading">
							<Loader variant="text" lines={2} lastLineWidth="50%" ariaLabel="Checking synchronization status" />
						</div>
					{:else if status?.status === 'in_sync'}
						<div class="space-y-3 py-12 text-center" data-testid="sync-in-sync">
							<iconify-icon icon="mdi:check-circle" class="mx-auto text-6xl text-success-500"></iconify-icon>
							<h2 class="text-xl font-semibold">System is in Sync</h2>
							<p class="text-surface-500">Your database and filesystem configurations match perfectly.</p>
						</div>
					{:else}
						<div class="space-y-4" data-testid="sync-changes">
							<div class="flex items-center justify-between">
								<h3 class="flex items-center gap-2 text-lg font-semibold">
									<iconify-icon icon="mdi:alert" class="text-warning-500"></iconify-icon>
									Changes Detected
								</h3>
								<p class="text-sm text-surface-500">
									{changeSummary().new} new, {changeSummary().updated} updated, {changeSummary().deleted} deleted
								</p>
							</div>

							<AdminCard class="overflow-x-auto w-full border border-surface-500/30 dark:border-surface-500/40">
								<table class="w-full text-sm border-collapse">
									<thead>
										<tr class="border-b border-surface-500/30 dark:border-surface-500/40 text-start text-xs uppercase tracking-wider text-surface-400">
											<th class="px-4 py-3 font-semibold">Name</th>
											<th class="px-4 py-3 font-semibold">Type</th>
											<th class="px-4 py-3 font-semibold">UUID</th>
											<th class="px-4 py-3 font-semibold text-end">Action</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
										{#each Object.entries(status?.changes || {}) as [changeType, items] (changeType)}
											{#each items as item (item.uuid || item.name)}
												<tr class="text-surface-600 dark:text-surface-400 hover:bg-surface-500/40 dark:hover:bg-surface-900/20">
													<td class="px-4 py-3 font-medium">{item.name}</td>
													<td class="px-4 py-3">
														<Badge preset="tonal" color="surface" class="capitalize">{item.type}</Badge>
													</td>
													<td class="px-4 py-3 font-mono text-xs text-surface-400">{item.uuid || '-'}</td>
													<td class="px-4 py-3 text-end">
														{#if changeType === 'new'}
															<Badge variant="tertiary" class="dark:preset-filled-primary-500">New (Create)</Badge>
														{/if}
														{#if changeType === 'updated'}
															<Badge variant="warning">Updated (Merge)</Badge>
														{/if}
														{#if changeType === 'deleted'}
															<Badge variant="error">Deleted (Missing)</Badge>
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
							<h3 class="mt-4 text-lg font-semibold">Backup & Content Transfer</h3>
							<p class="mt-2 text-surface-500 text-sm">Transfer editorial content packages (.svelty-package) between SveltyCMS instances with streaming NDJSON.</p>
							<div class="mt-4 flex justify-center gap-3">
								<Button variant="tertiary" onclick={exportCurrentConfig} leadingIcon="mdi:file-export">
									Export Schema as Code
								</Button>
							</div>
						</AdminCard>
					</div>
				{/if}

				{#if activeTab === 'debug'}
					<div transition:slide|local class="rounded border border-surface-500/30 bg-surface-500/10 p-4 dark:border-surface-500/40 dark:bg-surface-900/20">
						<h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon icon="mdi:bug-outline"></iconify-icon> Raw API Response</h3>
						<pre class="whitespace-pre-wrap text-xs max-h-125 overflow-y-auto p-2 border border-surface-500/30 dark:border-surface-500/40 rounded bg-surface-500/10 dark:bg-surface-800">{JSON.stringify(status, null, 2)}</pre>
					</div>
				{/if}
			</section>
		</AdminCard>
	</div>
</AdminPageShell>
