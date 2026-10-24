<!--
@file src/routes/(app)/config/system-settings/+page.svelte
@component
**System Settings**

Catalog-driven settings grouped by domain. Mirrors the `(app)` page contract:
`AdminPageShell` + `AdminCard`, a page-local group rail (desktop) / picker
(mobile), and one panel per group.

@props
- data: { isAdmin: boolean }

### Features:
- Persistent group navigation (desktop rail, mobile select) — no reliance on the
  right-sidebar menu to switch groups
- URL-driven selection (`?group=…`) with the first group as the SSR fallback
- Warning dots for groups with empty required configuration
- Single-level cards (no card-in-card) and semantic `--admin-*` tokens
-->

<script lang="ts">
	// Components
	import GDPRSettings from '@src/components/system/gdpr-settings.svelte';
	import GroupIcon from '@src/components/group-icon.svelte';
	import { groupsNeedingConfig } from './settings-state.svelte';
	import { setRouteContext } from '@src/stores/ui-store.svelte.ts';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Alert from '@components/ui/alert.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Select from '@components/ui/select.svelte';
	import {
		syssettings_action_required,
		syssettings_check_structure,
		syssettings_collections_moved,
		syssettings_configure_before_prod,
		syssettings_configure_following,
		syssettings_db_updated,
		syssettings_groups_need,
		syssettings_group_needs,
		syssettings_intro_part1,
		syssettings_logical_groups,
		syssettings_media_moved,
		syssettings_mode,
		syssettings_mt_heading,
		syssettings_mt_intro,
		syssettings_open,
		syssettings_repair_aria,
		syssettings_select_group,
		syssettings_selected_group_missing_part1,
		syssettings_selected_group_missing_part2,
		syssettings_title,
		syssettings_warnings
	} from '@src/paraglide/messages';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import GenericSettingsGroup from './generic-settings-group.svelte';

	// Import settings structure
	import { getSettingGroupsByRole } from './settings-groups';
	import { beforeNavigate } from '$app/navigation';
	import { showConfirm } from '@utils/modal.svelte';
	import Button from '@components/ui/button.svelte';

	// Get user admin status from page data (set by +page.server.ts)
	const { data } = $props();
	const isAdmin = $derived(data.isAdmin);

	// 🚀 DERIVED: availableGroups is computed synchronously for SSR and instant client render
	const availableGroups = $derived(
		getSettingGroupsByRole(isAdmin).sort((a, b) => a.name.localeCompare(b.name))
	);
	let hasUnsavedChanges = $state(false);
	let saveTrigger = $state<{ fire: () => void; discard?: () => void }>({ fire: () => {} });
	let saving = $state(false);

	// Unsaved changes guard (modal confirm instead of window.confirm)
	beforeNavigate(({ cancel, to }) => {
		if (!hasUnsavedChanges) return;
		cancel();
		showConfirm({
			title: 'Unsaved Changes',
			body: 'You have unsaved settings changes. Leave this page anyway?',
			onConfirm: () => {
				hasUnsavedChanges = false;
				// slop:suppress — resuming an interrupted navigation after the user
				// confirmed discard; not a static link, cannot be an <a data-preload>
				if (to?.url) goto(to.url.toString());
			}
		});
	});

	function selectGroup(groupId: string) {
		if (groupId === activeGroupId) return;
		const url = new URL(page.url.href);
		url.searchParams.set('group', groupId);
		goto(`${url.pathname}?${url.searchParams.toString()}`, { reset: false });
	}

	// Repair Action State
	let isRepairing = $state(false);
	let repairResult = $state<{ success: boolean; message?: string; error?: string } | null>(null);

	// Multi-Tenancy Migration State
	let migrationResult = $state<{
		success: boolean;
		message?: string;
		error?: string;
		details?: any;
	} | null>(null);
	let structureInfo = $state<{
		isMultiTenant?: boolean;
		needsMigration?: boolean;
		pendingAction?: 'to-multi' | 'to-single' | null;
		warnings?: string[];
	} | null>(null);
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
				? structureInfo.pendingAction === 'to-single'
					? 'to-single'
					: 'to-multi'
				: 'to-multi';
			const result = await runTenantMigration({ direction, tenantId: 'primary' });
			if (result.success) {
				migrationResult = { success: true, message: result.message, details: result.details };
			} else {
				migrationResult = { success: false, error: result.error || 'Migration failed' };
			}
		} catch (e: unknown) {
			migrationResult = {
				success: false,
				error: e instanceof Error ? e.message : 'Migration failed'
			};
		} finally {
			isMigrating = false;
		}
	}

	// Derived selection from URL. The first group is the SSR fallback so the
	// panel paints immediately instead of flashing an empty state before the
	// onMount redirect writes `?group=` into the URL.
	const selectedGroupId = $derived(page.url.searchParams.get('group'));
	const activeGroupId = $derived(selectedGroupId ?? availableGroups[0]?.id ?? '');
	const activeGroup = $derived(availableGroups.find((group) => group.id === activeGroupId) ?? null);
	const groupOptions = $derived(
		availableGroups.map((group) => ({ value: group.id, label: group.name }))
	);

	// Reset save button state when switching groups
	$effect(() => {
		void selectedGroupId; // track dependency for Svelte 5 reactivity
		hasUnsavedChanges = false;
	});

	// Track which groups need configuration from the server load payload.
	let storeHydrated = $state(false);
	$effect(() => {
		groupsNeedingConfig.clear();
		for (const id of data.groupsNeedingConfig) groupsNeedingConfig.add(id);
		storeHydrated = true;
	});

	// SSR renders from the load payload; once hydrated the shared store (which the
	// group form also updates after edits) takes over.
	const serverNeedsConfig = $derived(new Set(data.groupsNeedingConfig));
	const needsConfigIds = $derived(storeHydrated ? groupsNeedingConfig : serverNeedsConfig);
	const unconfiguredCount = $derived(needsConfigIds.size);

	onMount(() => {
		// Default selection if none in URL
		if (!selectedGroupId && availableGroups.length > 0) {
			const url = new URL(window.location.href);
			url.searchParams.set('group', availableGroups[0].id);
			goto(url.toString(), { replace: true });
		}
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

<AdminPageShell
	title={syssettings_title()}
	icon="mdi:cog-outline"
	showBackButton={true}
	backUrl="/config"
	spaceY="4"
>
	<div data-testid="system-settings-page" class="flex flex-col gap-4">
		<!-- Summary: group count + groups that still need configuration -->
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<p class="text-sm text-(--admin-text-muted)">
				{syssettings_intro_part1()}{' '}<span
					class="font-semibold text-tertiary-500 dark:text-primary-500"
					data-testid="system-settings-group-count">{availableGroups.length}</span
				>{' '}{syssettings_logical_groups()}
			</p>
			{#if unconfiguredCount > 0}
				<Badge variant="warning" size="sm">
					{unconfiguredCount}
					{unconfiguredCount === 1 ? syssettings_group_needs() : syssettings_groups_need()}
				</Badge>
			{/if}
		</div>

		{#if repairResult}
			<div role="status" aria-live="polite" data-testid="system-settings-repair-status">
				<Alert variant={repairResult.success ? 'success' : 'error'}>
					<div class="flex items-center gap-3">
						<iconify-icon
							icon={repairResult.success ? 'mdi:check-circle' : 'mdi:alert-circle'}
							width="20"
							aria-hidden="true"
						></iconify-icon>
						<p>{repairResult.success ? repairResult.message : repairResult.error}</p>
					</div>
				</Alert>
			</div>
		{/if}

		{#if unconfiguredCount > 0}
			<div role="status" data-testid="system-settings-needs-config">
				<Alert variant="warning">
					<div class="text-sm">
						<strong
							>{syssettings_action_required()}
							{unconfiguredCount}
							{unconfiguredCount === 1 ? syssettings_group_needs() : syssettings_groups_need()}
							{syssettings_configure_before_prod()}</strong
						>
						<p class="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
							<span>{syssettings_configure_following()}</span>
							{#each availableGroups.filter((g) => needsConfigIds.has(g.id)) as group, i (group.id)}
								<Button
									type="button"
									variant="transparent"
									size="sm"
									class="h-auto! min-w-0! px-1! py-0! font-semibold! underline decoration-dotted underline-offset-2 hover:opacity-90"
									data-testid={`settings-needs-config-${group.id}`}
									onclick={() => selectGroup(group.id)}
								>
									<GroupIcon icon={group.icon} class="inline" />
									{group.name}
								</Button>{i < unconfiguredCount - 1 ? ',' : ''}
							{/each}
						</p>
					</div>
				</Alert>
			</div>
		{/if}

		<!-- Mobile picker: the rail is hidden below lg -->
		<div class="lg:hidden">
			<Select
				value={activeGroupId}
				options={groupOptions}
				label={syssettings_select_group()}
				onchange={(id) => selectGroup(id)}
				data_testid="system-settings-group-select"
			/>
		</div>

		<!-- Selected group panel — group navigation lives in the global left sidebar -->
		<div class="min-w-0" data-testid="system-settings-group-panel">
			{#if activeGroup}
				{#key activeGroup.id}
					{#if activeGroup.id === 'gdpr'}
						<div data-testid={`settings-panel-${activeGroup.id}`}>
							<GDPRSettings group={activeGroup} />
						</div>
					{:else}
						<AdminCard class="p-4 md:p-6" data-testid={`settings-panel-${activeGroup.id}`}>
							<GenericSettingsGroup
								group={activeGroup}
								initialValues={data.activeGroupValues}
								{groupsNeedingConfig}
								bind:saveTrigger
								bind:saving
								onUnsavedChanges={(val) => (hasUnsavedChanges = val)}
							>
								{#if activeGroup.id === 'cache'}
									<Button
										variant="warning"
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
													setTimeout(() => {
														repairResult = null;
													}, 5000);
												} else {
													repairResult = {
														success: false,
														error: result.error || 'Repair failed'
													};
												}
											} catch (e: unknown) {
												repairResult = {
													success: false,
													error: e instanceof Error ? e.message || String(e) : 'Repair failed'
												};
											} finally {
												isRepairing = false;
											}
										}}
										aria-label={syssettings_repair_aria()}
										class="w-full items-center justify-center gap-1.5 sm:w-auto"
									>
										<iconify-icon
											icon="mdi:wrench"
											width="16"
											class={isRepairing ? 'animate-spin' : ''}
										></iconify-icon>
										<span class="hidden sm:inline"
											>{isRepairing ? 'Repairing...' : 'Repair Cache'}</span
										>
									</Button>
								{/if}
							</GenericSettingsGroup>
						</AdminCard>
					{/if}
				{/key}
			{:else if selectedGroupId}
				<AdminCard class="p-6" data-testid="system-settings-group-missing">
					<div class="flex flex-col items-center justify-center gap-3 text-center">
						<iconify-icon
							icon="mdi:folder-question-outline"
							width="32"
							class="text-(--admin-text-muted)"
							aria-hidden="true"
						></iconify-icon>
						<p class="text-(--admin-text-muted)">
							{syssettings_selected_group_missing_part1()} &quot;{selectedGroupId}&quot;
							{syssettings_selected_group_missing_part2()}
						</p>
						{#if availableGroups[0]}
							<Button
								variant="tertiary"
								type="button"
								onclick={() => selectGroup(availableGroups[0].id)}
							>
								{syssettings_open()}
								{availableGroups[0].name}
							</Button>
						{/if}
					</div>
				</AdminCard>
			{:else}
				<AdminCard class="p-6" data-testid="system-settings-group-unselected">
					<p class="text-center text-(--admin-text-muted)">{syssettings_select_group()}</p>
				</AdminCard>
			{/if}
		</div>

		<!-- Multi-Tenancy migration — separate concern, own card -->
		<AdminCard class="p-4 md:p-6" data-testid="system-settings-mt-migration">
			<div class="mb-4 flex items-start gap-3">
				<iconify-icon
					icon="mdi:server-network"
					width="22"
					class="mt-0.5 shrink-0 text-tertiary-500 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<div>
					<h2 class="text-lg font-semibold">{syssettings_mt_heading()}</h2>
					<p class="text-sm text-(--admin-text-muted)">{syssettings_mt_intro()}</p>
				</div>
			</div>

			{#if migrationResult}
				<div
					class="mb-4"
					role="status"
					aria-live="polite"
					data-testid="system-settings-migration-status"
				>
					<Alert variant={migrationResult.success ? 'success' : 'error'}>
						<p class="font-semibold">
							{migrationResult.success ? '\u2705' : '\u274c'}
							{migrationResult.message || migrationResult.error}
						</p>
						{#if migrationResult.details}
							<ul class="mt-2 list-inside list-disc text-sm opacity-90">
								<li>
									{syssettings_collections_moved()}
									{migrationResult.details.collectionsMoved}
								</li>
								<li>{syssettings_media_moved()} {migrationResult.details.mediaFilesMoved}</li>
								<li>{syssettings_db_updated()} {migrationResult.details.mediaRecordsUpdated}</li>
								{#if migrationResult.details.warnings.length > 0}
									<li>{syssettings_warnings()} {migrationResult.details.warnings.join(', ')}</li>
								{/if}
							</ul>
						{/if}
					</Alert>
				</div>
			{/if}

			{#if structureInfo}
				<div
					class="mb-4 text-sm"
					data-testid="system-settings-structure-info"
					role="status"
					aria-live="polite"
				>
					<p>
						{syssettings_mode()}
						<strong>{structureInfo.isMultiTenant ? 'Multi-Tenant' : 'Single-Tenant'}</strong>
					</p>
					{#if structureInfo.warnings && structureInfo.warnings.length > 0}
						<div class="mt-2 rounded-lg bg-warning-500/10 p-3 text-warning-500">
							{#each structureInfo.warnings as w, i (i)}
								<p class="text-xs">{'\u26a0\ufe0f'} {w}</p>
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
					<iconify-icon icon="mdi:refresh" width="16" class={isMigrating ? 'animate-spin' : ''}
					></iconify-icon>
					<span>{syssettings_check_structure()}</span>
				</Button>

				{#if structureInfo?.needsMigration}
					<Button
						variant="warning"
						type="button"
						disabled={isMigrating}
						onclick={runMigration}
						data-testid="system-settings-run-migration"
					>
						<iconify-icon
							icon="mdi:swap-horizontal-bold"
							width="16"
							class={isMigrating ? 'animate-spin' : ''}
						></iconify-icon>
						<span>{isMigrating ? 'Migrating...' : 'Migrate Now'}</span>
					</Button>
				{/if}
			</div>
		</AdminCard>
	</div>
</AdminPageShell>
