<!--
@file src/routes/(app)/config/import-export/+page.svelte
@description Dedicated Import/Export page for admin users
@features
- Full-screen import/export functionality
- Accessible from config navigation
- Comprehensive data backup and restore tools
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import ImportExportManager from '@components/admin/ImportExportManager.svelte';
	// Utils
	import { logger } from '@utils/logger.svelte';

	onMount(() => {
		logger.info('Import/Export page loaded');
	});
</script>

<svelte:head>
	<title>Import & Export - SveltyCMS</title>
	<meta name="description" content="Import and export your collections data for backup and migration purposes." />
</svelte:head>

<main class="container mx-auto p-6">
	<header class="mb-6">
		<PageTitle name="Import & Export" icon="mdi:database-import" showBackButton={true} backUrl="/config" />

		<div class="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
			<div class="flex items-start space-x-3">
				<iconify-icon icon="mdi:information" class="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400"></iconify-icon>
				<div class="text-sm">
					<p class="mb-2 font-medium text-blue-900 dark:text-blue-100">Data Management Tools</p>
					<ul class="space-y-1 text-blue-700 dark:text-blue-300">
						<li>• <strong>Export:</strong> Create backups of your collections data in JSON or CSV format</li>
						<li>• <strong>Import:</strong> Restore data from previous backups or migrate from other systems</li>
						<li>• <strong>Security:</strong> All operations are performed server-side - your data never leaves your server</li>
						<li>• <strong>Validation:</strong> Import process includes data validation and error reporting</li>
					</ul>
				</div>
			</div>
		</div>
	</header>

	<!-- Import/Export Manager Component -->
	<section class="rounded-lg bg-surface-50 p-6 shadow-sm dark:bg-surface-800">
		<ImportExportManager />
	</section>
</main>

<style>
	:global(.container) {
		max-width: 1200px;
	}
</style>
