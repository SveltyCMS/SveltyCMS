<!--
@file src/routes/(app)/config/systemsetting/+page.svelte
@description System Settings page with tabbed interface
All dynamic CMS settings organized into logical groups
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import { showToast } from '@utils/toast';

	// Import settings structure
	import { getSettingGroupsByRole } from './settingsGroups';
	import type { SettingGroup } from './settingsGroups';

	// Import setting component
	import GenericSettingsGroup from './GenericSettingsGroup.svelte';

	// Get user admin status from page data (set by +page.server.ts)
	export let data: { isAdmin: boolean };
	const isAdmin = data.isAdmin;

	let tabSet: number = 0;

	// Filter groups based on user role
	let availableGroups: SettingGroup[] = [];

	onMount(() => {
		availableGroups = getSettingGroupsByRole(isAdmin).sort((a, b) => a.name.localeCompare(b.name));
	});

	// Quick actions
	async function clearCache() {
		try {
			const response = await fetch('/api/cache/clear', {
				method: 'POST'
			});

			if (response.ok) {
				showToast('Cache cleared successfully', 'success');
			} else {
				const data = await response.json();
				showToast(data.error || 'Failed to clear cache', 'error');
			}
		} catch (error) {
			console.error('Error clearing cache:', error);
			showToast('Failed to clear cache', 'error');
		}
	}

	function reloadPage() {
		window.location.reload();
	}

	// Import/Export state
	let showImportModal = false;
	let showExportModal = false;
	let exportOptions = {
		includeSettings: true,
		includeCollections: false,
		includeSensitive: false,
		format: 'json' as 'json' | 'zip',
		sensitivePassword: ''
	};
	let importFile: File | null = null;
	let importStrategy: 'skip' | 'overwrite' | 'merge' = 'skip';
	let importPassword = '';
	let dryRun = true;

	async function exportConfig() {
		showExportModal = true;
	}

	async function performExport() {
		// Validate password if sensitive data is included
		if (exportOptions.includeSensitive && !exportOptions.sensitivePassword) {
			showToast('Password required to export sensitive data', 'warning');
			return;
		}

		try {
			const response = await fetch('/api/export/full', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(exportOptions)
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Export failed');
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// Get filename from Content-Disposition header or generate default
			const contentDisposition = response.headers.get('Content-Disposition');
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch ? filenameMatch[1] : `sveltycms-export-${new Date().toISOString()}.json`;

			a.download = filename;
			a.click();
			window.URL.revokeObjectURL(url);

			showToast('Configuration exported successfully', 'success');
			showExportModal = false;
		} catch (error) {
			console.error('Export error:', error);
			showToast(error instanceof Error ? error.message : 'Export failed', 'error');
		}
	}

	function openImportModal() {
		showImportModal = true;
		importFile = null;
		importStrategy = 'skip';
		importPassword = '';
		dryRun = true;
	}

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			importFile = target.files[0];
		}
	}

	async function performImport() {
		if (!importFile) {
			showToast('Please select a file to import', 'warning');
			return;
		}

		try {
			// Read file content
			const fileContent = await importFile.text();
			const importData = JSON.parse(fileContent);

			// Check if file has encrypted sensitive data
			if (importData.hasSensitiveData && !importPassword) {
				showToast('Password required to import encrypted sensitive data', 'warning');
				return;
			}

			// Perform import
			const response = await fetch('/api/import/full', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					data: importData,
					options: {
						strategy: importStrategy,
						dryRun: dryRun,
						validateOnly: false,
						sensitivePassword: importPassword || undefined
					}
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Import failed');
			}

			if (dryRun) {
				showToast(`Dry run complete: ${result.conflicts?.length || 0} conflicts detected`, 'info');
			} else {
				showToast(`Import successful: ${result.imported} imported, ${result.skipped} skipped, ${result.merged} merged`, 'success');
				showImportModal = false;

				// Reload page to show new settings
				setTimeout(() => reloadPage(), 1500);
			}
		} catch (error) {
			console.error('Import error:', error);
			showToast(error instanceof Error ? error.message : 'Import failed', 'error');
		}
	}

	function openDocs() {
		window.open('/docs/SYSTEM_SETTINGS_STRUCTURE.md', '_blank');
	}
</script>

<PageTitle name="System Settings" icon="mdi:cog" showBackButton={true} backUrl="/config" />
<div class="wrapper">
	<!-- Warning Banner -->
	<div class="alert variant-filled-error mb-4">
		<div class="alert-message">
			<h3 class="h4">⚠️ Administrator Access Required</h3>
			<p>
				These are critical system settings. Changes may affect system behavior and performance. Settings marked with "Restart Required" need a server
				restart to take effect.
			</p>
		</div>
	</div>

	<!-- Info Banner -->
	<div class="alert variant-filled-primary mb-6">
		<div class="alert-message">
			<h3 class="h4">💡 Dynamic Configuration</h3>
			<p>
				Settings are loaded dynamically from the database. Most changes take effect immediately without requiring a server restart. Settings are
				organized into {availableGroups.length} logical groups for easy management.
			</p>
		</div>
	</div>

	<!-- Settings Interface with Sidebar -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]">
		<!-- Sidebar Navigation -->
		<div class="card p-4">
			<h3 class="h5 mb-3">Settings Groups</h3>
			<nav class="space-y-1">
				{#each availableGroups as group, i}
					<button class="group-nav-item w-full p-3 text-left transition-all rounded-token" class:active={tabSet === i} on:click={() => (tabSet = i)}>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-lg">{group.icon}</span>
								<span class="text-sm font-medium">{group.name}</span>
							</div>
							{#if group.requiresRestart}
								<span class="variant-soft-warning badge text-xs">Restart</span>
							{/if}
						</div>
					</button>
				{/each}
			</nav>
		</div>

		<!-- Settings Panel -->
		<div class="settings-panel-container card">
			{#each availableGroups as group, i}
				{#if tabSet === i}
					<div class="settings-panel p-6">
						<!-- Use generic component for all groups -->
						<GenericSettingsGroup {group} />
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="card mt-6 p-4">
		<h3 class="h4 mb-4">Quick Actions</h3>
		<div class="flex flex-wrap gap-2">
			<button class="variant-filled-surface btn" on:click={reloadPage}>
				<span>🔄</span>
				<span>Reload Page</span>
			</button>
			<button class="variant-filled-warning btn" on:click={clearCache}>
				<span>🗑️</span>
				<span>Clear Cache</span>
			</button>
			<button class="variant-filled-primary btn" on:click={exportConfig}>
				<span>💾</span>
				<span>Export Config</span>
			</button>
			<button class="variant-filled-secondary btn" on:click={openImportModal}>
				<span>📥</span>
				<span>Import Config</span>
			</button>
			<button class="variant-filled-tertiary btn" on:click={openDocs}>
				<span>📚</span>
				<span>Documentation</span>
			</button>
		</div>
		<div class="text-surface-600-300-token mt-4 text-sm">
			<p>
				<strong>Tip:</strong> Use Export Config to backup your settings before making major changes. Import Config supports dry-run mode for safe validation.
			</p>
		</div>
	</div>

	<!-- System Status -->
	<div class="text-surface-600-300-token mt-6 text-center text-sm">
		<p>
			<span class="text-success-500">●</span>
			System Operational | Settings: <span class="font-semibold">Loaded</span> | Groups: <span class="font-semibold">{availableGroups.length}</span> |
			Environment: <span class="font-semibold">Dynamic</span>
		</p>
	</div>

	<!-- Export Modal -->
	{#if showExportModal}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-backdrop" on:click={() => (showExportModal = false)} role="button" tabindex="-1">
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="modal-content card p-6" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="export-modal-title" tabindex="0">
				<h3 id="export-modal-title" class="h3 mb-4">Export Configuration</h3>

				<div class="space-y-4">
					<label class="flex items-center space-x-2">
						<input type="checkbox" bind:checked={exportOptions.includeSettings} class="checkbox" />
						<span>Include System Settings</span>
					</label>

					<label class="flex items-center space-x-2">
						<input type="checkbox" bind:checked={exportOptions.includeCollections} class="checkbox" />
						<span>Include Collections</span>
					</label>

					<label class="flex items-center space-x-2">
						<input type="checkbox" bind:checked={exportOptions.includeSensitive} class="checkbox" />
						<span>Include Sensitive Data (⚠️ Passwords, Secrets - Password Protected)</span>
					</label>

					{#if exportOptions.includeSensitive}
						<div class="space-y-2">
							<label for="export-password" class="label">
								<span>🔐 Encryption Password (Required)</span>
							</label>
							<input
								id="export-password"
								type="password"
								bind:value={exportOptions.sensitivePassword}
								placeholder="Enter a strong password"
								class="input"
								required
							/>
							<p class="text-surface-600-300-token text-xs">This password will be required to import the sensitive data. Store it securely!</p>
						</div>
					{/if}

					<div class="alert variant-soft-warning p-3">
						<p class="text-sm">
							<strong>Note:</strong>
							{#if exportOptions.includeSensitive}
								Sensitive data (passwords, secrets, tokens) will be encrypted with AES-256-GCM using your password. The exported file is safe to store
								but keep your password secure!
							{:else}
								Exported configuration files contain system settings. Keep them secure and do not share publicly.
							{/if}
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-2">
					<button class="variant-ghost btn" on:click={() => (showExportModal = false)}> Cancel </button>
					<button
						class="variant-filled-primary btn"
						on:click={performExport}
						disabled={exportOptions.includeSensitive && !exportOptions.sensitivePassword}
					>
						<span>💾</span>
						<span>Export Now</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Import Modal -->
	{#if showImportModal}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-backdrop" on:click={() => (showImportModal = false)} role="button" tabindex="-1">
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="modal-content card p-6" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="import-modal-title" tabindex="0">
				<h3 id="import-modal-title" class="h3 mb-4">Import Configuration</h3>

				<div class="space-y-4">
					<div>
						<label for="import-file" class="label mb-2">
							<span>Select Configuration File</span>
						</label>
						<input id="import-file" type="file" accept=".json" on:change={handleFileChange} class="input" />
					</div>

					<div>
						<label for="import-strategy" class="label mb-2">
							<span>Conflict Resolution Strategy</span>
						</label>
						<select id="import-strategy" bind:value={importStrategy} class="select">
							<option value="skip">Skip - Keep existing values</option>
							<option value="overwrite">Overwrite - Replace with imported values</option>
							<option value="merge">Merge - Intelligently combine values</option>
						</select>
					</div>

					<div>
						<label for="import-password" class="label mb-2">
							<span>🔐 Decryption Password (If file contains encrypted sensitive data)</span>
						</label>
						<input id="import-password" type="password" bind:value={importPassword} placeholder="Enter password if required" class="input" />
						<p class="text-surface-600-300-token mt-1 text-xs">Only needed if the export included encrypted sensitive data</p>
					</div>

					<label class="flex items-center space-x-2">
						<input type="checkbox" bind:checked={dryRun} class="checkbox" />
						<span>Dry Run (Validate only, don't apply changes)</span>
					</label>

					<div class="alert variant-soft-warning p-3">
						<p class="text-sm">
							<strong>⚠️ Important:</strong> Always run a dry-run first to check for conflicts.
							{#if !dryRun}
								<strong class="text-warning-500">You are about to apply changes to the system!</strong>
							{/if}
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-2">
					<button class="variant-ghost btn" on:click={() => (showImportModal = false)}> Cancel </button>
					<button
						class="btn"
						class:variant-filled-secondary={dryRun}
						class:variant-filled-warning={!dryRun}
						on:click={performImport}
						disabled={!importFile}
					>
						<span>{dryRun ? '🔍' : '📥'}</span>
						<span>{dryRun ? 'Validate Import' : 'Import Now'}</span>
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style lang="postcss">
	.alert {
		@apply rounded-container-token;
	}

	.alert-message h3 {
		@apply mb-2;
	}

	.alert-message p {
		@apply text-sm opacity-90;
	}

	/* Sidebar navigation styles */
	.group-nav-item {
		@apply cursor-pointer border border-transparent transition-all;
	}

	.group-nav-item:not(.active):hover {
		@apply border-primary-500 bg-surface-200 shadow-sm;
	}

	:global(.dark) .group-nav-item:not(.active):hover {
		background-color: rgb(55, 65, 81);
	}

	.group-nav-item.active {
		@apply border-primary-600 bg-primary-500 font-semibold text-white;
	}

	.group-nav-item.active:hover {
		@apply bg-primary-600;
	}

	/* Settings panel */
	.settings-panel-container {
		@apply overflow-hidden;
		max-height: calc(100vh - 400px);
		min-height: 500px;
	}

	.settings-panel {
		@apply overflow-y-auto;
		height: 100%;
	}

	:global(.badge) {
		@apply rounded px-2 py-0.5;
	}

	/* Modal styles */
	.modal-backdrop {
		@apply fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80 backdrop-blur-sm;
	}

	.modal-content {
		@apply max-h-[90vh] w-full max-w-2xl overflow-y-auto;
	}

	/* Responsive sidebar */
	@media (max-width: 1023px) {
		/* On mobile, make sidebar a horizontal scrollable list */
		nav {
			@apply flex gap-2 overflow-x-auto pb-2;
		}

		.group-nav-item {
			@apply flex-shrink-0 whitespace-nowrap;
		}
	}
</style>
