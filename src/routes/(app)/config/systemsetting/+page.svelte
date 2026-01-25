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
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageTitle from '@components/PageTitle.svelte';
	import { logger } from '@utils/logger';
	import { groupsNeedingConfig } from '@stores/configStore.svelte.ts';

	// Import settings structure
	import { getSettingGroupsByRole } from './settingsGroups';
	import type { SettingGroup } from './settingsGroups';

	// Import setting component
	import GenericSettingsGroup from './GenericSettingsGroup.svelte';

	// Get user admin status from page data (set by +page.server.ts)
	const { data } = $props();
	const isAdmin = $derived(data.isAdmin);

	//  Use $state for all component state
	let availableGroups: SettingGroup[] = $state([]);

	// Derived selection from URL
	const selectedGroupId = $derived(page.url.searchParams.get('group'));

	// Track which groups need configuration
	let unconfiguredCount = $state(0);

	// Subscribe to changes in groups needing config (from store)
	groupsNeedingConfig.subscribe((groups) => {
		unconfiguredCount = groups.size;
	});

	// Remove filteredGroups logic as sidebar manages it externally

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

		// Default selection if none in URL
		if (!selectedGroupId && availableGroups.length > 0) {
			const url = new URL(window.location.href);
			url.searchParams.set('group', availableGroups[0].id);
			goto(url.toString(), { replaceState: true });
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
	<div class="wrapper preset-filled-error-500 mb-6">
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

<!-- Settings Panel (Standalone) -->
<div class="card flex flex-col mb-10">
	{#if selectedGroupId}
		{#key selectedGroupId}
			{@const group = availableGroups.find((g) => g.id === selectedGroupId)}
			{#if group}
				<div class="h-full overflow-y-auto p-6">
					<!-- Use generic component for all groups -->
					<GenericSettingsGroup {group} {groupsNeedingConfig} />
				</div>
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center">
					<p class="text-surface-500">Selected group not found.</p>
				</div>
			{/if}
		{/key}
	{:else}
		<div class="flex h-full items-center justify-center p-6 text-center">
			<p class="text-surface-500">Select a group to configure.</p>
		</div>
	{/if}
</div>

<!-- System Status -->
<div class="mx-auto mt-8 flex max-w-4xl items-center justify-center">
	<div class="badge-glass flex items-center gap-3 rounded-full px-6 py-3 text-sm">
		<span class="text-2xl text-tertiary-500 dark:text-primary-500">●</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">System Operational</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-50">Settings:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">Loaded</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-50">Groups:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{availableGroups.length}</span>
		<span class="text-dark dark:text-white">|</span>
		<span class="text-surface-600 dark:text-surface-50">Environment:</span>
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">Dynamic</span>
	</div>
</div>
