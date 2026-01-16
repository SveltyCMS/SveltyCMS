<!--
@file src/routes/(app)/config/import-export/+page.svelte
 @component
 **Client-side UI for configuration import/export**

### Purpose:
Provides a simple page-level interface to call the centralized,
protected import/export API endpoints. All heavy lifting (auth,
validation, batch processing, formats, per-collection handling)
is handled in reusable backend APIs.

### Features:
- Displays authenticated user info (from +page.server.ts).
- Provides a button to download/export current config via API.
- Allows uploading a JSON file to trigger import via API.
- Shows import results or errors in a formatted preview block.
- Indicates loading state for both import and export actions.
- Ensures UX safety by disabling buttons and resetting file inputs.
-->

<script lang="ts">
	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import ImportExportManager from '@components/admin/ImportExportManager.svelte';
</script>

<svelte:head>
	<title>Import & Export - SveltyCMS</title>
	<meta name="description" content="Import and export your collections data for backup and migration purposes." />
</svelte:head>

<header class="mb-6">
	<PageTitle name="Import & Export" icon="mdi:database-import" showBackButton={true} backUrl="/config" />

	<div class="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
		<div class="flex items-start space-x-3">
			<iconify-icon icon="mdi:information" width="24" class="mt-1 text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<div>
				<p class="mb-2 font-semibold">Data Management Tools:</p>
				<ul class="list-none space-y-1 text-sm">
					<li class="flex">
						<span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Export:</span>
						<span>Create backups of your collections data in JSON or CSV format</span>
					</li>
					<li class="flex">
						<span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Import:</span>
						<span>Restore data from previous backups or migrate from other systems</span>
					</li>
					<li class="flex">
						<span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Security:</span>
						<span>All operations are performed server-side - your data never leaves your server</span>
					</li>
					<li class="flex">
						<span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Validation:</span>
						<span>Import process includes data validation and error reporting</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</header>

<!-- <div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Import & Export</h2>
		<p class="mt-1 text-gray-600 dark:text-gray-400">Backup and restore your collection data</p>
	</div>

	<p class="text-sm">
		Welcome <span class="font-bold text-primary-500">{user.username}</span>
		({user.role})
	</p>

	<div class="flex gap-3">
		<section class="card p-4 md:p-6">
			<h3 class="h3 mb-4">Export Configuration</h3>
			<p class="mb-4 text-sm">Download a JSON backup of all your collections and settings.</p>
			<button onclick={handleExport} class="preset-filled-primary-500 btn" disabled={isExporting}>
				<iconify-icon icon="mdi:database-export" class="mr-2"></iconify-icon>
				<span>{isExporting ? 'Exporting...' : 'Download Export'}</span>
			</button>
		</section>

		<section class="card p-4 md:p-6">
			<h3 class="h3 mb-4">Import Configuration</h3>
			<p class="mb-4 text-sm">Restore configuration from a previously exported JSON file.</p>
			<input type="file" accept="application/json" onchange={handleImport} class="input-file" disabled={isImporting} />

			{#if isImporting}
				<p class="mt-4 animate-pulse text-sm text-primary-500">Importing, please wait...</p>
			{/if}

			{#if importResult}
				<div class="mt-4">
					<h4 class="mb-2 text-sm font-bold">Import Result:</h4>
					<pre class="card preset-soft max-h-64 overflow-x-auto p-4 font-mono text-xs">{importResult}</pre>
				</div>
			{/if}
		</section>
	</div>
</div> -->

<!-- Import/Export Manager Component -->
<section class="rounded-lg bg-surface-50 p-6 shadow-sm dark:bg-surface-800">
	<ImportExportManager />
</section>
