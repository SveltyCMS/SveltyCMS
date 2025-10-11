<!--
@file src/routes/(app)/config/systemsetting/+page.svelte
@description System Settings page with tabbed interface
All dynamic CMS settings organized into logical groups
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import PageTitle from '@components/PageTitle.svelte';
	import { showToast } from '@utils/toast';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';

	// Import settings structure
	import { getSettingGroupsByRole } from './settingsGroups';
	import type { SettingGroup } from './settingsGroups';

	// Import setting component
	import GenericSettingsGroup from './GenericSettingsGroup.svelte';

	const modalStore = getModalStore();

	// Get user admin status from page data (set by +page.server.ts)
	export let data: { isAdmin: boolean };
	const isAdmin = data.isAdmin;

	let tabSet: number = 0;
	let currentGroupHasUnsavedChanges = false;

	// Filter groups based on user role
	let availableGroups: SettingGroup[] = [];

	// Track which groups need configuration
	let groupsNeedingConfig = writable<Set<string>>(new Set());
	let unconfiguredCount = 0;

	// Subscribe to changes in groups needing config
	groupsNeedingConfig.subscribe((groups) => {
		unconfiguredCount = groups.size;
	});

	// Handle unsaved changes callback from child
	function handleUnsavedChanges(hasChanges: boolean) {
		currentGroupHasUnsavedChanges = hasChanges;
	}

	// Handle tab switch with unsaved changes warning
	function handleTabSwitch(newTabIndex: number) {
		if (currentGroupHasUnsavedChanges) {
			// Show confirmation modal
			const modal: ModalSettings = {
				type: 'confirm',
				title: 'Unsaved Changes',
				body: '<p>You have unsaved changes in the current settings group.</p><p><strong>Do you want to discard these changes?</strong></p>',
				response: (confirmed: boolean) => {
					if (confirmed) {
						// User confirmed, switch tabs
						currentGroupHasUnsavedChanges = false;
						tabSet = newTabIndex;
					}
					// If not confirmed, do nothing (stay on current tab)
				}
			};
			modalStore.trigger(modal);
		} else {
			// No unsaved changes, switch immediately
			tabSet = newTabIndex;
		}
	}

	// Check all groups for empty fields on page load
	async function checkAllGroupsForEmptyFields() {
		const groupsWithEmptyFields = new Set<string>();

		// Check each available group
		for (const group of availableGroups) {
			try {
				const response = await fetch(`/api/settings/${group.id}`);
				const data = await response.json();

				if (data.success && data.values) {
					// Check if this group has empty required/critical fields
					const hasEmptyFields = group.fields.some((field) => {
						const value = data.values[field.key];

						// Check for empty strings in critical fields
						if (typeof value === 'string') {
							return value === '' && (field.required || field.key.includes('HOST') || field.key.includes('EMAIL'));
						}

						return false;
					});

					if (hasEmptyFields) {
						groupsWithEmptyFields.add(group.id);
					}
				}
			} catch (err) {
				console.error(`Failed to check group ${group.id}:`, err);
			}
		}

		// Update the store with all groups that need configuration
		groupsNeedingConfig.set(groupsWithEmptyFields);
	}

	onMount(() => {
		availableGroups = getSettingGroupsByRole(isAdmin).sort((a, b) => a.name.localeCompare(b.name));
		// Check all groups after they're loaded
		checkAllGroupsForEmptyFields();
	});

	// Quick actions (these functions are kept for potential future use)

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
</script>

<PageTitle name="Dynamic System Settings" icon="mdi:cog" showBackButton={true} backUrl="/config" />

<!-- Info Banner -->
<p class="text-surface-600-300-token mb-6 px-2">
	These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with "Restart
	Required" need a server restart. Settings are organized into <span class="font-bold text-primary-500">{availableGroups.length}</span>
	logical groups for easy management.
</p>

{#if unconfiguredCount > 0}
	<div class="alert variant-filled-error mb-6">
		<div class="alert-message">
			<strong
				>⚠️ Action Required: {unconfiguredCount}
				{unconfiguredCount === 1 ? 'group needs' : 'groups need'} configuration before production use.</strong
			>
			<p class="mt-2">
				Please configure the following {unconfiguredCount === 1 ? 'group' : 'groups'}:
				{#each availableGroups.filter((g) => $groupsNeedingConfig.has(g.id)) as group, i}
					<span class="font-semibold">
						{group.icon}
						{group.name}{i < unconfiguredCount - 1 ? ', ' : ''}
					</span>
				{/each}
			</p>
		</div>
	</div>
{/if}

<!-- Settings Interface with Sidebar -->
<div class="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]">
	<!-- Sidebar Navigation -->
	<div class="card py-4">
		<h3 class="h5 mb-3 text-center font-bold">Settings Groups</h3>
		<nav class="divide-y divide-surface-300 dark:divide-surface-400">
			{#each availableGroups as group, i}
				<button class="group-nav-item w-full p-3 text-left transition-all" class:active={tabSet === i} onclick={() => handleTabSwitch(i)}>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-lg">{group.icon}</span>
							<span class="text-sm font-medium">{group.name}</span>
						</div>
						<div class="flex items-center gap-1">
							{#if $groupsNeedingConfig.has(group.id)}
								<span class="text-lg text-warning-500" title="Needs configuration">⚠️</span>
							{/if}
							{#if group.requiresRestart}
								<span class="variant-soft-warning badge text-xs">Restart</span>
							{/if}
						</div>
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
					<GenericSettingsGroup {group} {groupsNeedingConfig} onUnsavedChanges={handleUnsavedChanges} />
				</div>
			{/if}
		{/each}
	</div>
</div>

<!-- System Status -->
<div class="mx-auto mt-8 flex max-w-4xl items-center justify-center">
	<div class="badge-glass flex items-center gap-3 rounded-full px-6 py-3 text-sm">
		<span class="text-2xl text-tertiary-500 dark:text-primary-500">●</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">System Operational</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-300">Settings:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">Loaded</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-300">Groups:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{availableGroups.length}</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-300">Environment:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">Dynamic</span>
	</div>
</div>

<!-- Export Modal -->
{#if showExportModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-backdrop" onclick={() => (showExportModal = false)} role="button" tabindex="-1">
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="modal-content card p-6"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="export-modal-title"
			tabindex="0"
		>
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
				<button class="variant-ghost btn" onclick={() => (showExportModal = false)}> Cancel </button>
				<button
					class="variant-filled-primary btn"
					onclick={performExport}
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
	<div class="modal-backdrop" onclick={() => (showImportModal = false)} role="button" tabindex="-1">
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="modal-content card p-6"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="import-modal-title"
			tabindex="0"
		>
			<h3 id="import-modal-title" class="h3 mb-4">Import Configuration</h3>

			<div class="space-y-4">
				<div>
					<label for="import-file" class="label mb-2">
						<span>Select Configuration File</span>
					</label>
					<input id="import-file" type="file" accept=".json" onchange={handleFileChange} class="input" />
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
				<button class="variant-ghost btn" onclick={() => (showImportModal = false)}> Cancel </button>
				<button
					class="btn"
					class:variant-filled-secondary={dryRun}
					class:variant-filled-warning={!dryRun}
					onclick={performImport}
					disabled={!importFile}
				>
					<span>{dryRun ? '🔍' : '📥'}</span>
					<span>{dryRun ? 'Validate Import' : 'Import Now'}</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	.alert {
		@apply rounded-container-token;
	}

	.alert-message p {
		@apply text-sm opacity-90;
	}

	/* Sidebar navigation styles */
	.group-nav-item {
		@apply cursor-pointer transition-all;
	}

	.group-nav-item:not(.active):hover {
		@apply bg-surface-200;
	}

	:global(.dark) .group-nav-item:not(.active):hover {
		@apply bg-surface-700;
	}

	.group-nav-item.active {
		@apply bg-primary-500 font-semibold text-white;
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
			/* Remove dividers on mobile for horizontal layout */
			border-top: none;
		}

		nav > * {
			border-top: none !important;
		}

		.group-nav-item {
			@apply flex-shrink-0 whitespace-nowrap rounded-token;
		}
	}
</style>
