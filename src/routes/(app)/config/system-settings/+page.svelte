<!--
@file src/routes/(app)/config/system-settings/+page.svelte
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
// Components
import GDPRSettings from "@src/components/system/gdpr-settings.svelte";
import { groupsNeedingConfig } from "@src/stores/config-store.svelte.ts";
import { setRouteContext } from "@src/stores/ui-store.svelte.ts";
import { logger } from "@utils/logger";
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import StickyActions from '@components/ui/sticky-actions.svelte';
import { onMount, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import GenericSettingsGroup from "./generic-settings-group.svelte";
import type { SettingGroup } from "./settings-groups";

// Import settings structure
import { getSettingGroupsByRole } from "./settings-groups";
import { beforeNavigate } from "$app/navigation";
	import Button from '@components/ui/button.svelte';

// Get user admin status from page data (set by +page.server.ts)
const { data } = $props();
const isAdmin = $derived(data.isAdmin);

//  Use $state for all component state
let availableGroups: SettingGroup[] = $state([]);
let hasUnsavedChanges = $state(false);
let saveTrigger = $state({ fire: () => {} });
let saving = $state(false);

// Unsaved changes guard
beforeNavigate(({ cancel }) => {
	if (hasUnsavedChanges) {
		if (!confirm("You have unsaved changes. Leave anyway?")) {
			cancel();
		}
	}
});

// Repair Action State
let isRepairing = $state(false);
let repairResult = $state<{ success: boolean; message?: string; error?: string } | null>(null);

// Derived selection from URL
	const selectedGroupId = $derived(page.url.searchParams.get("group"));

	// Reset save button state when switching groups
	$effect(() => {
		void selectedGroupId; // track dependency for Svelte 5 reactivity
		hasUnsavedChanges = false;
	});

// Track which groups need configuration
const unconfiguredCount = $derived(groupsNeedingConfig.size);


// Check all groups for empty fields on page load using batch endpoint
async function checkAllGroupsForEmptyFields() {
	try {
		const response = await fetch("/api/settings/all");
		const data = await response.json();

		if (data.success && data.groups) {
			const groupsWithEmptyFields = new SvelteSet<string>();

			for (const group of availableGroups) {
				const values = data.groups[group.id];
				if (!values) continue;

				const hasEmptyFields = group.fields.some((field) => {
					const value = values[field.key];
					if (typeof value === "string") {
						return (
							value === "" &&
							(field.required ||
								field.key.includes("HOST") ||
								field.key.includes("EMAIL"))
						);
					}
					return false;
				});

				if (hasEmptyFields) {
					groupsWithEmptyFields.add(group.id);
				}
			}

			// Update the store with all groups that need configuration
			groupsNeedingConfig.clear();
			groupsWithEmptyFields.forEach((id) => groupsNeedingConfig.add(id));
		}
	} catch (err) {
		logger.error(`Failed to check groups:`, err);
	}
}


onMount(() => {
	availableGroups = getSettingGroupsByRole(isAdmin).sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	// Default selection if none in URL
	if (!selectedGroupId && availableGroups.length > 0) {
		const url = new URL(window.location.href);
		url.searchParams.set("group", availableGroups[0].id);
		goto(url.toString(), { replaceState: true });
	}

	checkAllGroupsForEmptyFields();
});

$effect(() => {
	untrack(() => {
		setRouteContext({ isSystemSettings: true });
	});
	return () => {
		untrack(() => {
			setRouteContext({ isSystemSettings: false });
		});
	};
});
</script>

<AdminPageShell title="System Settings" icon="mdi:cog-outline" showBackButton={true} backUrl="/config" spaceY="8">
	{#snippet actions()}
		<StickyActions>

			<Button
				variant="tertiary"
				type="button"
				disabled={saving || !hasUnsavedChanges}
				onclick={() => saveTrigger.fire()}
				class="dark:"
			>
				{#if saving}
					<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
					<span>Saving...</span>
				{:else}
					<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
					<span>{hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
				{/if}
			</Button>
		</StickyActions>
	{/snippet}

	<AdminCard class="border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
		<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500">Configure global system settings</h2>

		<p class="text-surface-600 dark:text-surface-300 text-sm mb-6">
			These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with
			"Restart Required" need a server restart. Settings are organized into <span class="font-bold text-tertiary-500 dark:text-primary-500">{availableGroups.length}</span>
			logical groups for easy management.
		</p>

		{#if repairResult}
			<div class="mb-6">
				<div class="preset-filled-{repairResult.success ? 'success' : 'error'}-500 p-4 rounded">
					<div class="flex items-center gap-3">
						<span>{repairResult.success ? '✅' : '❌'}</span>
						<p>{repairResult.success ? repairResult.message : repairResult.error}</p>
					</div>
				</div>
			</div>
		{/if}


		{#if unconfiguredCount > 0}
			<div class="preset-filled-error-500 p-4 rounded mb-6">
				<div class="text-sm opacity-90">
					<strong
						>⚠️ Action Required: {unconfiguredCount}
						{unconfiguredCount === 1 ? 'group needs' : 'groups need'}
						configuration before production use.</strong
					>
					<p class="mt-2">
						Please configure the following {unconfiguredCount === 1 ? 'group' : 'groups'}:
						{#each availableGroups.filter((g) => groupsNeedingConfig.has(g.id)) as group, i (group.id)}
							<span class="font-semibold">
								{group.icon}
								{group.name}{i < unconfiguredCount - 1 ? ', ' : ''}
							</span>
						{/each}
					</p>
				</div>
			</div>
		{/if}

		<!-- Settings Layout -->
				<AdminCard class="flex flex-col">
			{#if selectedGroupId}
				{#key selectedGroupId}
					{@const group = availableGroups.find((g) => g.id === selectedGroupId)}
					{#if group}
						<div class="h-full overflow-y-auto p-6">
							{#if group.id === 'gdpr'}
								<GDPRSettings {group} />
							{:else}
							<GenericSettingsGroup
								{group}
								{groupsNeedingConfig}
								bind:saveTrigger
								bind:saving
								onUnsavedChanges={(val) => (hasUnsavedChanges = val)}
							>
								{#if selectedGroupId === 'cache'}
									<Button variant="warning"
										type="button"
										disabled={isRepairing}
										onclick={async () => {
											isRepairing = true;
											repairResult = null;
											try {
												const { repairContentCache } = await import('./admin.remote');
												const result = await repairContentCache();
												if (result.success) {
													repairResult = { success: true, message: result.message };
													setTimeout(() => { repairResult = null; }, 5000);
												} else {
													repairResult = { success: false, error: result.error || 'Repair failed' };
												}
											} catch (e: unknown) {
												repairResult = { success: false, error: e instanceof Error ? e.message || String(e) : 'Repair failed' };
											} finally {
												isRepairing = false;
											}
										}}
										aria-label="Repair Cache"
									 class="items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium w-full sm:w-auto">
										<iconify-icon icon="mdi:wrench" width="16" class={isRepairing ? 'animate-spin' : ''}></iconify-icon>
										<span class="hidden sm:inline">{isRepairing ? 'Repairing...' : 'Repair Cache'}</span>
									</Button>
								{/if}
							</GenericSettingsGroup>
							{/if}
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
		</AdminCard>
	</AdminCard>


</AdminPageShell>
