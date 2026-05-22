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
import PageTitle from "@src/components/page-title.svelte";
import GDPRSettings from "@src/components/system/gdpr-settings.svelte";
import { groupsNeedingConfig } from "@src/stores/config-store.svelte.ts";
import { setRouteContext } from "@src/stores/ui-store.svelte.ts";
import { logger } from "@utils/logger";
import { onMount, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { enhance } from "$app/forms";
import { page } from "$app/state";
import GenericSettingsGroup from "./generic-settings-group.svelte";
import type { SettingGroup } from "./settings-groups";

// Import settings structure
import { getSettingGroupsByRole } from "./settings-groups";
import { beforeNavigate } from "$app/navigation";

// Get user admin status from page data (set by +page.server.ts)
const { data } = $props();
const isAdmin = $derived(data.isAdmin);

//  Use $state for all component state
let availableGroups: SettingGroup[] = $state([]);
let searchTerm = $state("");
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

function handleRepair() {
	isRepairing = true;
	repairResult = null;
	return async ({ result }: any) => {
		isRepairing = false;
		if (result.type === 'success') {
			repairResult = { success: true, message: result.data.message };
			setTimeout(() => { repairResult = null; }, 5000);
		} else if (result.type === 'failure' || result.type === 'error') {
			repairResult = { success: false, error: result.data?.error || 'Repair failed' };
		}
	};
}


// Derived selection from URL
const selectedGroupId = $derived(page.url.searchParams.get("group"));

// Track which groups need configuration
const unconfiguredCount = $derived(groupsNeedingConfig.size);

// Filter groups based on search term
const filteredGroups = $derived(
	availableGroups.filter(
		(g) =>
			g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			g.description.toLowerCase().includes(searchTerm.toLowerCase()),
	),
);

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

async function exportAll() {
	try {
		const res = await fetch("/api/settings/all");
		const data = await res.json();
		if (data.success) {
			const blob = new Blob([JSON.stringify(data.groups, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `sveltycms-settings-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		}
	} catch (err) {
		logger.error("Failed to export settings:", err);
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

<PageTitle
	name="Dynamic System Settings"
	icon="mdi:cog"
	showBackButton={true}
	backUrl="/config"
>
	<div class="flex flex-wrap items-center gap-2">
		<!-- Save changes button: active/lights up only when modifications are made -->
		{#if selectedGroupId && selectedGroupId !== 'gdpr'}
			<button
				onclick={() => saveTrigger.fire()}
				class="btn preset-filled-primary-500 flex items-center gap-1.5 min-w-[120px]"
				disabled={saving || !hasUnsavedChanges}
			>
				{#if saving}
					<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
					<span>Saving...</span>
				{:else}
					<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
					<span>{hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
				{/if}
			</button>
		{/if}

		<!-- Global actions: Repair & Export All -->
		<form method="POST" action="?/repairContentCache" use:enhance={handleRepair} class="w-full sm:w-auto">
			<button disabled={isRepairing} class="btn preset-filled-warning-500 w-full flex items-center justify-center gap-1.5">
				<span>{isRepairing ? '⏳' : '🛠️'}</span>
				<span>{isRepairing ? 'Repairing...' : 'Repair Cache'}</span>
			</button>
		</form>

		<button onclick={exportAll} class="btn preset-filled-surface-500 w-full sm:w-auto flex items-center justify-center gap-1.5">
			<span>📤</span>
			<span>Export All JSON</span>
		</button>
	</div>
</PageTitle>

<div class="mb-6 px-2">
	<p class="text-surface-600 dark:text-surface-300 text-sm">
		These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with
		"Restart Required" need a server restart. Settings are organized into <span class="font-bold text-primary-500">{availableGroups.length}</span>
		logical groups for easy management.
	</p>
</div>

{#if repairResult}
	<div class="mb-6 px-2">
		<div class="wrapper {repairResult.success ? 'preset-filled-success-500' : 'preset-filled-error-500'} text-surface-600 dark:text-surface-300">
			<div class="flex items-center gap-3">
				<span>{repairResult.success ? '✅' : '❌'}</span>
				<p>{repairResult.success ? repairResult.message : repairResult.error}</p>
			</div>
		</div>
	</div>
{/if}

<!-- Mobile Navigation Tabs & Search -->
<div class="mb-6 space-y-4 px-2 md:hidden">
	<input bind:value={searchTerm} placeholder="Search settings..." class="input w-full" />

	<div class="flex gap-2 overflow-x-auto pb-2 snap-x scrollbar-hide">
		{#each filteredGroups as g}
			<a
				href={`?group=${g.id}`}
				data-sveltekit-preload-data="hover"
				class="btn {selectedGroupId === g.id ? 'preset-filled-primary-500' : 'preset-tonal-surface'} whitespace-nowrap snap-start flex items-center justify-center gap-2"
			>
				<span>{g.icon}</span>
				<span>{g.name}</span>
				{#if groupsNeedingConfig.has(g.id)}
					<span class="ml-1 text-xs">⚠️</span>
				{/if}
			</a>
		{/each}
	</div>
</div>

{#if unconfiguredCount > 0}
	<div class="wrapper preset-filled-error-500 text-surface-600 dark:text-surface-300 mb-6">
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
<div class="mb-10">
	<!-- Settings Panel Column -->
	<div class="card flex flex-col bg-surface-50-950 border border-surface-200/50 dark:border-surface-700/50">
		{#if selectedGroupId}
			{#key selectedGroupId}
				{@const group = availableGroups.find((g) => g.id === selectedGroupId)}
				{#if group}
					<div class="h-full overflow-y-auto p-6">
						<!-- Use generic component for all groups -->
						{#if group.id === 'gdpr'}
							<GDPRSettings {group} />
						{:else}
							<GenericSettingsGroup
								{group}
								{groupsNeedingConfig}
								bind:saveTrigger
								bind:saving
								onUnsavedChanges={(val) => (hasUnsavedChanges = val)}
							/>
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
	</div>
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
