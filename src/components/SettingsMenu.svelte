<!--
@file src/components/SettingsMenu.svelte
@component
**Settings Menu Sidebar**
Sidebar navigation for System Settings
-->

<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getSettingGroupsByRole } from '@src/routes/(app)/config/systemsetting/settingsGroups';
	import type { SettingGroup } from '@src/routes/(app)/config/systemsetting/settingsGroups';
	import { groupsNeedingConfig } from '@stores/configStore.svelte';

	// Props
	let { isFullSidebar = true } = $props();

	// State
	let searchTerm = $state('');

	// Derived
	const user = $derived(page.data.user);
	const isAdmin = $derived(user?.role === 'admin' || user?.role === 'sudo'); // Simple admin check, should match +page logic
	const availableGroups: SettingGroup[] = $derived(getSettingGroupsByRole(isAdmin).sort((a, b) => a.name.localeCompare(b.name)));
	const selectedGroupId = $derived(page.url.searchParams.get('group'));

	// Filter logic
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

	function handleGroupClick(groupId: string) {
		// Update URL query param to switch groups
		const url = new URL(page.url);
		url.searchParams.set('group', groupId);
		goto(url.toString());
	}
</script>

<div class="mt-2 flex flex-col h-full bg-transparent">
	<!-- Search -->
	<div class="relative mb-2 {isFullSidebar ? 'w-full' : 'max-w-[135px]'}">
		<input
			type="text"
			bind:value={searchTerm}
			placeholder={isFullSidebar ? 'Search settings...' : 'Search'}
			class="w-full rounded border border-surface-300 bg-surface-50 px-3 pr-11 text-sm outline-none transition-all hover:border-surface-400 focus:border-tertiary-500 dark:border-surface-600 dark:bg-surface-800 {isFullSidebar
				? 'h-12 py-3'
				: 'h-10 py-2'}"
			aria-label="Search settings"
		/>
		<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
			<iconify-icon icon="ic:outline-search" width="20"></iconify-icon>
		</div>
	</div>

	<!-- Groups List -->
	<div class="flex-1 overflow-y-auto px-1 space-y-1 settings-list">
		{#each filteredGroups as group (group.id)}
			<button
				class="w-full cursor-pointer rounded-lg p-2 text-left transition-colors flex items-center justify-between {selectedGroupId === group.id
					? 'bg-primary-500 text-white'
					: 'hover:bg-surface-200 dark:hover:bg-surface-700'}"
				onclick={() => handleGroupClick(group.id)}
				title={group.name}
			>
				<div class="flex items-center gap-3 overflow-hidden">
					<span class="text-xl shrink-0">{group.icon}</span>
					{#if isFullSidebar}
						<span class="text-sm font-medium truncate">{group.name}</span>
					{/if}
				</div>

				{#if isFullSidebar}
					<div class="flex items-center gap-1">
						{#if $groupsNeedingConfig.has(group.id)}
							<span class="text-lg text-warning-500" title="Needs configuration">⚠️</span>
						{/if}
					</div>
				{:else if $groupsNeedingConfig.has(group.id)}
					<!-- Dot for collapsed state -->
					<div class="w-2 h-2 rounded-full bg-warning-500 absolute top-1 right-1"></div>
				{/if}
			</button>
		{/each}

		{#if filteredGroups.length === 0}
			<div class="p-4 text-center text-sm text-surface-500">
				<p>No results</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.settings-list {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500)) transparent;
	}
	.settings-list::-webkit-scrollbar {
		width: 4px;
	}
	.settings-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.settings-list::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500));
		border-radius: 4px;
	}
</style>
