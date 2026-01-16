<!--
@files src/routes/(app)/config/configurationManager/+page.svelte
@component
**This file implements the Configuration Manager page, allowing users to synchronize configuration between filesystem and database. It provides import/export functionality with detailed status and change tracking.**
-->
<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { toaster } from '@stores/store.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import { onMount } from 'svelte';

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
	let activeTab: 'sync' | 'import' | 'export' | 'debug' = $state('sync');

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
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			status = await res.json();
			console.debug('[Config Sync] Received status:', status);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toaster.error({ description: `Failed to fetch status: ${errorMsg}` });
			status = null;
		} finally {
			isLoading = false;
		}
	}

	let fileToImport: File | null = $state(null);

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		fileToImport = target.files ? target.files[0] : null;
	}

	async function performImport() {
		if (!status || status.unmetRequirements.length > 0) {
			toaster.warning({ description: 'Sync blocked due to unmet requirements.' });
			return;
		}

		isProcessing = true;
		try {
			const payload: { action: string; payload?: any } = { action: 'import' };

			if (fileToImport) {
				const fileContent = await fileToImport.text();
				payload.payload = JSON.parse(fileContent);
				toaster.info({ description: `Importing from file: ${fileToImport.name}` });
			} else {
				toaster.info({ description: 'No file selected, performing standard filesystem sync.' });
			}

			const res = await fetch('/api/config_sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await res.json();
			if (!res.ok) throw new Error(result.message || `HTTP ${res.status}`);

			toaster.success({ description: result.message || 'Sync successful!' });
			await loadStatus(); // Refresh status after sync/import
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toaster.error({ description: `Sync failed: ${errorMsg}` });
		} finally {
			isProcessing = false;
			fileToImport = null;
		}
	}

	function exportToJSON() {
		if (!status || !status.changes) {
			toaster.warning({ description: 'No changes to export.' });
			return;
		}
		const jsonString = JSON.stringify(status.changes, null, 2);
		const blob = new Blob([jsonString], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `svelty-config-changes-${new Date().toISOString()}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toaster.success({ description: 'Configuration changes exported to JSON.' });
	}

	function exportToCSV() {
		toaster.info({ description: 'CSV export is not yet implemented.' });
	}

	// Sync all detected changes (filesystem -> DB)
	function syncAllChanges() {
		performImport();
	}

	onMount(() => {
		loadStatus();
	});
</script>

<!-- Page Title and Back Button (single instance, at top) -->
<PageTitle name="Configuration Manager" icon="mdi:sync-circle" showBackButton={true} backUrl="/config" />

<div class="wrapper">
	<!-- Header Description -->
	<div class="preset-soft-surface-500 mb-4 p-4">
		<p class="text-surface-600 dark:text-surface-300">
			This tool manages the synchronization between configuration defined in the filesystem (the "source of truth") and the configuration active in
			the database. Use it to deploy structural changes between different environments (e.g., from development to live).
		</p>
	</div>

	<!-- Tabs -->
	<div class="flex w-full overflow-x-auto border border-surface-300 bg-surface-100/70 dark:border-surface-700 dark:bg-surface-800/70">
		{#each ['sync', 'import', 'export', 'debug'] as tab}
			<!-- Explicitly type tab as 'sync' | 'import' | 'export' | 'debug' -->
			{#key tab}
				<button
					class="flex-1 py-3 text-center text-sm font-medium transition-all duration-200"
					class:!bg-tertiary-500={activeTab === tab}
					class:!text-white={activeTab === tab}
					class:!dark:bg-primary-500={activeTab === tab}
					class:!dark:text-surface-900={activeTab === tab}
					class:dark:text-surface-200={activeTab !== tab}
					class:text-surface-700={activeTab !== tab}
					onclick={() => (activeTab = tab as 'sync' | 'import' | 'export' | 'debug')}
				>
					{tab.charAt(0).toUpperCase() + tab.slice(1)}
				</button>
			{/key}
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
						{#each status.unmetRequirements as req}
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
					<p class="text-surface-500">
						{changeSummary().new} new, {changeSummary().updated} updated, {changeSummary().deleted} deleted.
					</p>
					<div class="overflow-hidden border border-surface-200 dark:border-surface-700">
						<table class="table w-full text-sm">
							<thead class="bg-surface-100 dark:bg-surface-800">
								<tr>
									<th>Name</th>
									<th>Type</th>
									<th>Change</th>
								</tr>
							</thead>
							<tbody>
								{#each Object.entries(status?.changes || {}) as [changeType, items]}
									{#each items as item}
										<tr class="border-t border-surface-200 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800/50">
											<td>{item.name}</td>
											<td><span class="preset-soft badge capitalize">{item.type}</span></td>
											<td>
												{#if changeType === 'new'}<span class="preset-filled-success-500 badge">New</span>{/if}
												{#if changeType === 'updated'}<span class="preset-filled-warning-500 badge">Updated</span>{/if}
												{#if changeType === 'deleted'}<span class="preset-filled-error-500 badge">Deleted</span>{/if}
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

		{#if activeTab === 'import'}
			<div transition:slide|local class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40">
				<h3 class="mb-3 flex items-center gap-2 font-semibold">
					<iconify-icon icon="mdi:database-import-outline"></iconify-icon> Import Configuration from File
				</h3>
				<p class="mb-4 text-sm text-surface-500">Upload a JSON or CSV file containing configuration changes to apply them to the database.</p>
				<div class="flex flex-col gap-4">
					<input type="file" class="input" accept=".json,.csv" onchange={handleFileSelect} />
					<button
						class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"
						disabled={!fileToImport || isProcessing}
						onclick={performImport}
					>
						<iconify-icon icon="mdi:upload" class={isProcessing ? 'animate-spin' : ''}></iconify-icon>
						{isProcessing ? 'Importing...' : 'Import from File'}
					</button>
				</div>
			</div>
		{/if}

		{#if activeTab === 'export'}
			<div transition:slide|local class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40">
				<h3 class="mb-3 flex items-center gap-2 font-semibold">
					<iconify-icon icon="mdi:export"></iconify-icon> Export Configuration
				</h3>
				<p class="mb-4 text-sm text-surface-500">Save the detected configuration changes to a file.</p>
				<div class="flex gap-4">
					<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" disabled={isProcessing} onclick={exportToJSON}>
						<iconify-icon icon="mdi:code-json"></iconify-icon> Export as JSON
					</button>
					<button class="preset-filled-secondary-500 btn" disabled={isProcessing} onclick={exportToCSV}>
						<iconify-icon icon="mdi:file-csv-outline"></iconify-icon> Export as CSV
					</button>
				</div>
			</div>
		{/if}

		{#if activeTab === 'debug'}
			<div transition:slide|local class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40">
				<h3 class="mb-3 flex items-center gap-2 font-semibold">
					<iconify-icon icon="mdi:bug-outline"></iconify-icon> Raw API Response
				</h3>
				<pre class="whitespace-pre-wrap text-xs">{JSON.stringify(status, null, 2)}</pre>
			</div>
		{/if}
	</section>
</div>
