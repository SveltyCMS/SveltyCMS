<!--
@file src/routes/(app)/config/systemsetting/+page.svelte
@component
**System Settings page with tabbed interface**
All dynamic CMS settings organized into logical groups

### Props
- data: { isAdmin: boolean }

### Features:
- Tabbed interface for easy navigation between setting groups
- Search bar to quickly find specific settings or groups
- Warning indicators for groups needing configuration
- Responsive design with dropdown for mobile view
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import PageTitle from '@components/PageTitle.svelte';
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modalState.svelte';

	// Import settings structure
	import { getSettingGroupsByRole } from './settingsGroups';
	import type { SettingGroup } from './settingsGroups';

	// Import setting component
	import GenericSettingsGroup from './GenericSettingsGroup.svelte';

	// Get user admin status from page data (set by +page.server.ts)
	const { data } = $props();
	const isAdmin = $derived(data.isAdmin);

	//  Use $state for all component state
	let selectedGroupId: string | null = $state(null);
	let currentGroupHasUnsavedChanges = $state(false);
	let availableGroups: SettingGroup[] = $state([]);
	let searchTerm = $state('');

	// Track which groups need configuration
	const groupsNeedingConfig = writable<Set<string>>(new Set());
	let unconfiguredCount = $state(0);

	// Subscribe to changes in groups needing config
	groupsNeedingConfig.subscribe((groups) => {
		unconfiguredCount = groups.size;
	});

	// This is more efficient and declarative than a `$: {}` block.
	const filteredGroups = $derived.by(() => {
		if (!searchTerm) {
			return availableGroups;
		}
		const lowerCaseSearchTerm = searchTerm.toLowerCase();
		return availableGroups.filter((group) => {
			if (group.name.toLowerCase().includes(lowerCaseSearchTerm)) return true;
			if (group.description?.toLowerCase().includes(lowerCaseSearchTerm)) return true;
			if (
				group.fields.some((field) => field.label.toLowerCase().includes(lowerCaseSearchTerm) || field.key.toLowerCase().includes(lowerCaseSearchTerm))
			)
				return true;
			return false;
		});
	});

	// This runs after the DOM updates, which is the correct place for this logic.
	$effect(() => {
		// If the current selection is no longer in the filtered list, select the first available one.
		if (selectedGroupId && !filteredGroups.find((g) => g.id === selectedGroupId)) {
			if (filteredGroups.length > 0) {
				selectedGroupId = filteredGroups[0].id;
			} else {
				selectedGroupId = null; // Clear selection if no results
			}
		}
	});

	function handleUnsavedChanges(hasChanges: boolean) {
		currentGroupHasUnsavedChanges = hasChanges;
	}

	// Handle tab switch with unsaved changes warning
	function handleTabSwitch(newGroupId: string) {
		if (currentGroupHasUnsavedChanges) {
			// Show confirmation modal
			showConfirm({
				title: 'Unsaved Changes',
				body: '<p>You have unsaved changes. Do you want to discard them?</p>',
				onConfirm: () => {
					// User confirmed, switch tabs
					currentGroupHasUnsavedChanges = false;
					selectedGroupId = newGroupId;
				}
			});
		} else {
			selectedGroupId = newGroupId;
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
				logger.error(`Failed to check group ${group.id}:`, err);
			}
		}

		// Update the store with all groups that need configuration
		groupsNeedingConfig.set(groupsWithEmptyFields);
	}

	onMount(() => {
		availableGroups = getSettingGroupsByRole(isAdmin).sort((a, b) => a.name.localeCompare(b.name));
		if (availableGroups.length > 0) {
			selectedGroupId = availableGroups[0].id;
		}
		checkAllGroupsForEmptyFields();
	});
</script>

<PageTitle name="Dynamic System Settings" icon="mdi:cog" showBackButton={true} backUrl="/config" />

<p class="mb-6 px-2 text-surface-600 dark:text-surface-300">
	These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with "Restart
	Required" need a server restart. Settings are organized into <span class="font-bold text-primary-500">{availableGroups.length}</span>
	logical groups for easy management.
</p>

{#if unconfiguredCount > 0}
	<div class="rounded-xl preset-filled-error-500 mb-6">
		<div class="text-sm opacity-90">
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
	<div class="card hidden py-4 lg:block">
		<h3 class="h5 mb-3 px-4 text-left font-bold">Settings Groups</h3>
		<div class="mb-3">
			<input type="search" bind:value={searchTerm} placeholder="🔎 Search settings..." class="input w-full" />
		</div>
		<nav class="divide-y divide-preset-300 dark:divide-preset-400">
			{#each filteredGroups as group (group.id)}
				<button
					class="w-full cursor-pointer p-3 text-left transition-all {selectedGroupId === group.id
						? 'bg-primary-500 font-semibold text-white hover:bg-primary-600'
						: 'hover:bg-surface-200 dark:hover:bg-surface-700'}"
					onclick={() => handleTabSwitch(group.id)}
				>
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
								<span class="preset-soft-warning-500 badge text-xs">Restart</span>
							{/if}
						</div>
					</div>
				</button>
			{/each}
			{#if filteredGroups.length === 0}
				<p class="p-4 text-center text-sm text-surface-500">No matching groups found.</p>
			{/if}
		</nav>
	</div>

	<!-- Settings Panel -->
	<div class="card overflow-hidden min-h-[500px] max-h-[calc(100vh-400px)]">
		<div class="border-b p-4 lg:hidden">
			<div class="space-y-4">
				<div>
					<input type="search" bind:value={searchTerm} placeholder="🔎 Search settings..." class="input w-full" />
				</div>
				<div>
					<label for="setting-group-select" class="label sr-only text-sm font-bold">
						<span>Select Settings Group</span>
					</label>
					<select id="setting-group-select" class="select w-full" bind:value={selectedGroupId}>
						{#each filteredGroups as group (group.id)}
							<option value={group.id}>{group.icon} {group.name}</option>
						{:else}
							<option disabled>No results found</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		{#if selectedGroupId}
			{#key selectedGroupId}
				{@const group = availableGroups.find((g) => g.id === selectedGroupId)}
				{#if group}
					<div class="h-full overflow-y-auto p-6">
						<!-- Use generic component for all groups -->
						<GenericSettingsGroup {group} {groupsNeedingConfig} onUnsavedChanges={handleUnsavedChanges} />
					</div>
				{:else}
					<div class="flex h-full items-center justify-center p-6 text-center">
						<p class="text-surface-500">Selected group not found.</p>
					</div>
				{/if}
			{/key}
		{:else if filteredGroups.length === 0}
			<div class="flex h-full items-center justify-center p-6 text-center">
				<p class="text-surface-500">No matching groups found.</p>
			</div>
		{/if}
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
```
