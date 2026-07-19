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
import { groupsNeedingConfig } from "@src/stores/settings-config-state.svelte.ts";
import { setRouteContext } from "@src/stores/ui-store.svelte.ts";
import { logger } from "@utils/logger";
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import StickyActions from '@components/ui/sticky-actions.svelte';
import { onMount, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import GenericSettingsGroup from "./generic-settings-group.svelte";
import type { SettingGroup } from "./settings-groups";

// Import settings structure
import { getSettingGroupsByRole } from "./settings-groups";
import { hasEmptyConfigFields } from "./settings-utils";
import { beforeNavigate } from "$app/navigation";
import { showConfirm } from "@utils/modal.svelte";
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';

// Get user admin status from page data (set by +page.server.ts)
const { data } = $props();
const isAdmin = $derived(data.isAdmin);

//  Use $state for all component state
let availableGroups: SettingGroup[] = $state([]);
let hasUnsavedChanges = $state(false);
let saveTrigger = $state<{ fire: () => void; discard?: () => void }>({ fire: () => {} });
let saving = $state(false);
let groupSearch = $state("");

const filteredGroups = $derived(
	availableGroups.filter(
		(g) =>
			!groupSearch ||
			g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
			g.id.toLowerCase().includes(groupSearch.toLowerCase()) ||
			g.description?.toLowerCase().includes(groupSearch.toLowerCase()),
	),
);

// Unsaved changes guard (modal confirm instead of window.confirm)
beforeNavigate(({ cancel, to }) => {
	if (!hasUnsavedChanges) return;
	cancel();
	showConfirm({
		title: "Unsaved Changes",
		body: "You have unsaved settings changes. Leave this page anyway?",
		onConfirm: () => {
			hasUnsavedChanges = false;
			if (to?.url) goto(to.url.toString());
		},
	});
});

function selectGroup(groupId: string) {
	const url = new URL(page.url.href);
	url.searchParams.set("group", groupId);
	goto(`${url.pathname}?${url.searchParams.toString()}`, { keepFocus: true, noScroll: true });
}

// Repair Action State
let isRepairing = $state(false);
let repairResult = $state<{ success: boolean; message?: string; error?: string } | null>(null);

// Multi-Tenancy Migration State
let migrationResult = $state<{ success: boolean; message?: string; error?: string; details?: any } | null>(null);
let structureInfo = $state<{ isMultiTenant?: boolean; needsMigration?: boolean; pendingAction?: 'to-multi' | 'to-single' | null; warnings?: string[] } | null>(null);
let isMigrating = $state(false);

async function checkStructure() {
  isMigrating = true;
  try {
    const { detectTenantStructure } = await import('./admin.remote');
    const result = await detectTenantStructure({});
    if (result.success) {
      structureInfo = result;
    } else {
      structureInfo = { warnings: [result.error || 'Check failed'] };
    }
  } catch (e: unknown) {
    structureInfo = { warnings: [e instanceof Error ? e.message : 'Check failed'] };
  } finally {
    isMigrating = false;
  }
}

async function runMigration() {
  isMigrating = true;
  migrationResult = null;
  try {
    const { runTenantMigration } = await import('./admin.remote');
    const direction = structureInfo?.needsMigration
      ? structureInfo.pendingAction === 'to-single' ? 'to-single' : 'to-multi'
      : 'to-multi';
    const result = await runTenantMigration({ direction, tenantId: 'primary' });
    if (result.success) {
      migrationResult = { success: true, message: result.message, details: result.details };
    } else {
      migrationResult = { success: false, error: result.error || 'Migration failed' };
    }
  } catch (e: unknown) {
    migrationResult = { success: false, error: e instanceof Error ? e.message : 'Migration failed' };
  } finally {
    isMigrating = false;
  }
}

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
				if (!values || typeof values !== "object") continue;

				if (hasEmptyConfigFields(group.fields, values as Record<string, unknown>)) {
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
			{#if hasUnsavedChanges}
				<Button
					variant="ghost"
					type="button"
					disabled={saving}
					onclick={() => saveTrigger.discard?.()}
					data-testid="system-settings-discard"
					aria-label="Discard unsaved settings changes"
				>
					<iconify-icon icon="mdi:undo" width="18"></iconify-icon>
					<span>Discard</span>
				</Button>
			{/if}
			<Button
				variant="tertiary"
				type="button"
				disabled={saving || !hasUnsavedChanges}
				onclick={() => saveTrigger.fire()}
				data-testid="system-settings-save"
				aria-label="Save settings changes"
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

	<div data-testid="system-settings-page" class="contents">
	<AdminCard class="border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
		<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500">Configure global system settings</h2>

		<p class="text-surface-600 dark:text-surface-300 text-sm mb-6">
			These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with
			"Restart Required" need a server restart. Settings are organized into <span class="font-bold text-tertiary-500 dark:text-primary-500" data-testid="system-settings-group-count">{availableGroups.length}</span>
			logical groups for easy management.
		</p>

		<!-- In-page group navigator (complements sidebar settings menu) -->
		<div class="mb-6 space-y-3" data-testid="system-settings-group-nav">
			<Input
				type="search"
				bind:value={groupSearch}
				placeholder="Search setting groups..."
				aria-label="Search setting groups"
				data-testid="system-settings-group-search"
				class="w-full max-w-md"
			/>
			<div class="flex flex-wrap gap-2" role="list" aria-label="Setting groups">
				{#each filteredGroups as group (group.id)}
					<div role="listitem">
						<button
							type="button"
							data-testid={`settings-group-${group.id}`}
							data-group-id={group.id}
							aria-current={selectedGroupId === group.id ? 'true' : undefined}
							onclick={() => selectGroup(group.id)}
							class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
								{selectedGroupId === group.id
									? 'border-primary-500 bg-primary-500/15 text-primary-700 dark:text-primary-300'
									: 'border-surface-200 bg-surface-50 text-surface-700 hover:border-primary-400 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200'}
								{groupsNeedingConfig.has(group.id) ? 'ring-1 ring-error-500/50' : ''}"
						>
							<span aria-hidden="true">{group.icon}</span>
							<span>{group.name}</span>
							{#if groupsNeedingConfig.has(group.id)}
								<span class="text-error-500" title="Needs configuration">●</span>
							{/if}
						</button>
					</div>
				{:else}
					<p class="text-sm text-surface-500" data-testid="system-settings-group-empty">No groups match your search.</p>
				{/each}
			</div>
		</div>

		{#if repairResult}
			<div class="mb-6" role="status" aria-live="polite" data-testid="system-settings-repair-status">
				<div class="preset-filled-{repairResult.success ? 'success' : 'error'}-500 p-4 rounded">
					<div class="flex items-center gap-3">
						<span aria-hidden="true">{repairResult.success ? '✅' : '❌'}</span>
						<p>{repairResult.success ? repairResult.message : repairResult.error}</p>
					</div>
				</div>
			</div>
		{/if}


		{#if unconfiguredCount > 0}
			<div class="preset-filled-error-500 p-4 rounded mb-6" role="status" data-testid="system-settings-needs-config">
				<div class="text-sm opacity-90">
					<strong
						>⚠️ Action Required: {unconfiguredCount}
						{unconfiguredCount === 1 ? 'group needs' : 'groups need'}
						configuration before production use.</strong
					>
					<p class="mt-2">
						Please configure the following {unconfiguredCount === 1 ? 'group' : 'groups'}:
						{#each availableGroups.filter((g) => groupsNeedingConfig.has(g.id)) as group, i (group.id)}
							<button
								type="button"
								class="font-semibold underline decoration-dotted underline-offset-2 hover:opacity-90"
								data-testid={`settings-needs-config-${group.id}`}
								onclick={() => selectGroup(group.id)}
							>
								{group.icon}
								{group.name}
							</button>{i < unconfiguredCount - 1 ? ', ' : ''}
						{/each}
					</p>
				</div>
			</div>
		{/if}

		<!-- Settings Layout -->
				<AdminCard class="flex flex-col" data-testid="system-settings-group-panel">
			{#if selectedGroupId}
				{#key selectedGroupId}
					{@const group = availableGroups.find((g) => g.id === selectedGroupId)}
					{#if group}
						<div class="h-full overflow-y-auto p-6" data-testid={`settings-panel-${group.id}`}>
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
										data-testid="system-settings-repair-cache"
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
						<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="system-settings-group-missing">
							<p class="text-surface-500">Selected group &quot;{selectedGroupId}&quot; was not found or is not available for your role.</p>
							{#if availableGroups[0]}
								<Button variant="tertiary" type="button" onclick={() => selectGroup(availableGroups[0].id)}>
									Open {availableGroups[0].name}
								</Button>
							{/if}
						</div>
					{/if}
				{/key}
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center" data-testid="system-settings-group-unselected">
					<p class="text-surface-500">Select a group to configure.</p>
				</div>
			{/if}
		</AdminCard>
	</AdminCard>

	<!-- Multi-Tenancy Migration -->
	<AdminCard class="border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50" data-testid="system-settings-mt-migration">
		<h2 class="h2 mb-4 font-bold text-tertiary-600 dark:text-primary-500">Multi-Tenancy Migration</h2>
		<p class="text-surface-600 dark:text-surface-300 text-sm mb-4">
			Migrate collections and media files between flat and tenant-namespaced structures.
			Check the current state, then migrate if needed.
		</p>

		{#if migrationResult}
			<div
				class="mb-4 p-4 rounded preset-filled-{migrationResult.success ? 'success' : 'error'}-500"
				role="status"
				aria-live="polite"
				data-testid="system-settings-migration-status"
			>
				<p class="font-semibold">{migrationResult.success ? '\u2705' : '\u274c'} {migrationResult.message || migrationResult.error}</p>
				{#if migrationResult.details}
					<ul class="mt-2 text-sm opacity-90 list-disc list-inside">
						<li>Collections moved: {migrationResult.details.collectionsMoved}</li>
						<li>Media files moved: {migrationResult.details.mediaFilesMoved}</li>
						<li>DB records updated: {migrationResult.details.mediaRecordsUpdated}</li>
						{#if migrationResult.details.warnings.length > 0}
							<li>Warnings: {migrationResult.details.warnings.join(', ')}</li>
						{/if}
					</ul>
				{/if}
			</div>
		{/if}

		{#if structureInfo}
			<div class="mb-4 text-sm" data-testid="system-settings-structure-info" role="status" aria-live="polite">
				<p>Mode: <strong>{structureInfo.isMultiTenant ? 'Multi-Tenant' : 'Single-Tenant'}</strong></p>
				{#if structureInfo.warnings && structureInfo.warnings.length > 0}
					<div class="mt-2 p-3 rounded bg-warning-500/10 text-warning-700 dark:text-warning-300">
						{#each structureInfo.warnings as w, i (i)}
							<p class="text-xs">\u26a0\ufe0f {w}</p>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap gap-3">
			<Button
				variant="tertiary"
				type="button"
				disabled={isMigrating}
				onclick={checkStructure}
				data-testid="system-settings-check-structure"
			>
				<iconify-icon icon="mdi:refresh" width="16" class={isMigrating ? 'animate-spin' : ''}></iconify-icon>
				<span>Check Structure</span>
			</Button>

			{#if structureInfo?.needsMigration}
				<Button
					variant="warning"
					type="button"
					disabled={isMigrating}
					onclick={runMigration}
					data-testid="system-settings-run-migration"
				>
					<iconify-icon icon="mdi:swap-horizontal-bold" width="16" class={isMigrating ? 'animate-spin' : ''}></iconify-icon>
					<span>{isMigrating ? 'Migrating...' : 'Migrate Now'}</span>
				</Button>
			{/if}
		</div>
	</AdminCard>
	</div>

		</AdminPageShell>
