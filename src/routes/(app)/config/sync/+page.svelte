<!--
@files src/routes/(app)/config/sync/+page.svelte
@component
**Configuration Sync & Backup Manager**
Allows synchronization between filesystem and database, and full system backup/restore.
-->
<script lang="ts">
	import ImportExportManager from '@src/components/admin/import-export-manager.svelte';
	import PageTitle from '@src/components/page-title.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { showToast } from '@utils/toast';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	type ConfigStatus = {
		status: 'in_sync' | 'changes_detected' | 'error';
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
	let activeTab: 'sync' | 'backups' | 'debug' = $state('sync');

	// prettier counts
	const changeSummary = $derived(() => ({
		new: status?.changes?.new?.length || 0,
		updated: status?.changes?.updated?.length || 0,
		deleted: status?.changes?.deleted?.length || 0
	}));

	async function loadStatus() {
		isLoading = true;
		try {
			const res = await fetch('/api/config_sync');
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			status = await res.json();
			console.debug('[Config Sync] Received status:', status);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			showToast(`Failed to fetch status: ${errorMsg}`, 'error');
			status = null;
		} finally {
			isLoading = false;
		}
	}

	async function performSync() {
		if (!status || status.unmetRequirements.length > 0) {
			showToast('Sync blocked due to unmet requirements.', 'warning');
			return;
		}

		isProcessing = true;
		try {
			// Standard filesystem sync
			const payload = { action: 'import' };
			showToast('Performing standard filesystem sync...', 'info');

			const res = await fetch('/api/config_sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.message || `HTTP ${res.status}`);
			}

			showToast(result.message || 'Sync successful!', 'success');
			await loadStatus(); // Refresh status after sync
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			showToast(`Sync failed: ${errorMsg}`, 'error');
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

<!-- Page Title and Back Button -->
<PageTitle name="Config Sync & Backup" icon="mdi:sync-circle" showBackButton={true} backUrl="/config" />

<div class="wrapper">
	<!-- Description -->
	<div class="preset-tonal-surface mb-4 p-4">
		<p class="text-surface-600 dark:text-surface-300">
			Manage your system configuration. Use <strong>Sync</strong> to deploy code changes to the database, and <strong>Backups</strong> to import/export
			full system data.
		</p>
	</div>

	<!-- Tabs -->
	<div
		class="flex w-full overflow-x-auto border border-surface-300 bg-surface-100/70 dark:text-surface-50 dark:bg-surface-800/70"
		role="tablist"
		aria-label="Sync Options"
	>
		{#each ['sync', 'backups', 'debug'] as tab (tab)}
			<SystemTooltip
				title={tab === 'sync' ? 'Deploy changes' : tab === 'backups' ? 'Import/Export Data' : 'Debug Info'}
				positioning={{ placement: 'top' }}
			>
				<button
					class="flex-1 py-3 text-center text-sm font-medium transition-all duration-200 px-6"
					class:!bg-tertiary-500={activeTab === tab}
					class:!text-white={activeTab === tab}
					class:!dark:bg-primary-500={activeTab === tab}
					class:!dark:text-surface-900={activeTab === tab}
					class:dark:text-surface-200={activeTab !== tab}
					class:text-surface-700={activeTab !== tab}
					onclick={() => (activeTab = tab as 'sync' | 'backups' | 'debug')}
					role="tab"
					aria-selected={activeTab === tab}
					aria-controls="{tab}-panel"
					id="{tab}-tab"
				>
					{tab.charAt(0).toUpperCase() + tab.slice(1)}
				</button>
			</SystemTooltip>
		{/each}
	</div>

	<!-- Content -->
	<section transition:fade|local>
		{#if activeTab === 'sync'}
			{#if status?.unmetRequirements && status.unmetRequirements.length > 0}
				<div class="alert preset-filled-error-500 my-4 p-4" transition:slide>
					<h4 class="font-bold">Sync Blocked: Unmet Requirements</h4>
					<p class="text-sm">The following requirements must be met before you can import configuration:</p>
					<ul class="mt-2 list-disc pl-5 text-sm">
						{#each status.unmetRequirements as req (req.name + req.type)}
							<li><strong>{req.name}</strong> ({req.type}): {req.requirement}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="my-4">
				<button
					class="preset-filled-tertiary-500 btn w-full dark:preset-filled-primary-500 sm:w-auto"
					disabled={isProcessing || !status || status.status === 'in_sync' || status.unmetRequirements.length > 0}
					onclick={syncAllChanges}
				>
					<iconify-icon icon="mdi:sync" class={isProcessing ? 'animate-spin' : ''}></iconify-icon>
					{isProcessing ? 'Syncing...' : 'Sync All Changes'}
				</button>
			</div>

			{#if isLoading}
				<div class="flex animate-pulse flex-col items-center py-12 text-surface-500">
					<iconify-icon icon="mdi:sync" class="mb-3 animate-spin text-5xl"></iconify-icon>
					Checking synchronization status...
					<button
						onclick={loadStatus}
						class="preset-filled-tertiary-500 btn mt-6 flex items-center gap-2 dark:preset-filled-primary-500"
						disabled={isLoading}
					>
						<iconify-icon icon="mdi:refresh" class={isLoading ? 'animate-spin' : ''}></iconify-icon>
						{isLoading ? 'Checking...' : 'Refresh'}
					</button>
				</div>
			{:else if status?.status === 'in_sync'}
				<div class="space-y-3 py-12 text-center">
					<iconify-icon icon="mdi:check-circle" class="mx-auto text-6xl text-success-500"></iconify-icon>
					<h2 class="text-xl font-semibold">System is in Sync</h2>
					<p class="text-surface-500">Your database and filesystem configurations match perfectly.</p>
				</div>
			{:else}
				<div class="space-y-4">
					<h3 class="flex items-center gap-2 text-lg font-semibold">
						<iconify-icon icon="mdi:alert" class="text-warning-500"></iconify-icon>
						Changes Detected
					</h3>
					<p class="">{changeSummary().new} new, {changeSummary().updated} updated, {changeSummary().deleted} deleted.</p>
					<div class="overflow-hidden border border-surface-200 dark:text-surface-50">
						<table class="table w-full text-sm">
							<thead class="bg-surface-100 dark:bg-surface-800">
								<tr>
									<th>Name</th>
									<th>Type</th>
									<th>Change</th>
								</tr>
							</thead>
							<tbody>
								{#each Object.entries(status?.changes || {}) as [changeType, items] (changeType)}
									{#each items as item (item.uuid || item.name)}
										<tr class="border-t border-surface-200 hover:bg-surface-50 dark:text-surface-50 dark:hover:bg-surface-800/50">
											<td>{item.name}</td>
											<td><span class="preset-tonal-surface-500 badge capitalize">{item.type}</span></td>
											<td>
												{#if changeType === 'new'}
													<span class="preset-filled-primary-500 badge">New</span>
												{/if}
												{#if changeType === 'updated'}
													<span class="variant-filled-warning badge">Updated</span>
												{/if}
												{#if changeType === 'deleted'}
													<span class="preset-filled-error-500 badge">Deleted</span>
												{/if}
											</td>
										</tr>
									{/each}
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		{/if}

		{#if activeTab === 'backups'}
			<div transition:slide|local class="space-y-4"><ImportExportManager /></div>
		{/if}

		{#if activeTab === 'debug'}
			<div transition:slide|local class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40">
				<h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon icon="mdi:bug-outline"></iconify-icon> Raw API Response</h3>
				<pre
					class="whitespace-pre-wrap text-xs max-h-[500px] overflow-y-auto p-2 border border-surface-200 dark:border-surface-700 rounded bg-surface-100 dark:bg-surface-800">{JSON.stringify(
						status,
						null,
						2
					)}</pre>
			</div>
		{/if}
	</section>
</div>
