<!--
@file src/routes/(app)/config/access-management/+page.svelte
@component
**This page manages the Access Management system, including roles and permissions**

@example
<AccessManagement />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

### Features
- Navigate between permissions, roles, and admin role management tabs
- View and manage system permissions
- Assign roles and permissions to users
- Reset restores the last-saved role snapshot (not the stale page load)
- A confirmed unsaved-changes prompt resumes the cancelled destination
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Tabs from '@components/ui/tabs';
	import {
		access_intro,
		access_permissions_role_all,
		access_reset,
		access_reset_changes_aria,
		access_save_all_aria,
		access_save_count,
		access_saving,
		access_title,
		access_tab_admin,
		access_tab_sso,
		access_tab_website_tokens,
		system_permission,
		system_roles
	} from '@src/paraglide/messages';
	// Statically imported on purpose: `{#await import(...)}` renders the pending
	// branch during SSR, so every hard reload painted "Loading permissions…"
	// until the whole client module graph had hydrated. The tab payload is
	// `page.data` (already server-loaded), so the table must be in the SSR HTML.
	import AdminRole from './admin-role.svelte';
	import Permissions from './permissions.svelte';
	import Roles from './roles.svelte';
	import SsoProviders from './sso-providers.svelte';
	import WebsiteTokens from './website-tokens.svelte';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { rethrow } from '@utils/error-handling';
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { modalState } from '@utils/modal.svelte';
	import Button from '@components/ui/button.svelte';

	// Use $state for local component state
	let currentTab = $state('0'); // Initial tab set to string '0' for Tabs component

	// Two role lists, never more: the canonical draft every tab writes into via
	// `setRoleData`, and the last-saved snapshot Reset restores. The snapshot is
	// deliberately separate from `page.data.roles` — page data is captured once at
	// load, so a Reset after a successful save must not fall back to it (audit F03).
	// `structuredClone`/`$state.snapshot` keep the lists from aliasing each other.
	let savedRoles = structuredClone(page.data.roles ?? []);
	let rolesData = $state(untrack(() => structuredClone(page.data.roles ?? []))); // Renamed from `roles` to `rolesData` for clarity with internal `roles` in sub-components

	// Bumped whenever the draft is replaced from the snapshot (Reset) or promoted
	// to it (save). The Roles view derives its rows from `rolesData`, but its
	// modification bookkeeping is event-based — the epoch tells it to drop the
	// entries that described the previous draft.
	let draftEpoch = $state(0);

	// Admin role hint shown in the tab strip (permissions tab). The tab body no
	// longer repeats the page title, so this is the only "admin is implicit" note.
	const adminRole = $derived(
		(rolesData as { name?: string; isAdmin?: boolean }[] | undefined)?.find((role) => role.isAdmin)
	);

	// Track the number of modified permissions/roles for the "Save" button
	let modifiedCount = $state(0);
	let hasModifiedChanges = $state(false);

	// Function to update the roles data from child components
	const setRoleData = (data: any) => {
		rolesData = data;
		hasModifiedChanges = true; // Any change from children marks the page as modified
	};

	// Function to update the count of modified items (e.g., permissions, roles)
	const updateModifiedCount = (count: number) => {
		modifiedCount = count;
		hasModifiedChanges = count > 0;
	};

	const saveAllChanges = async () => {
		await globalLoadingStore.withLoading(
			loadingOperations.configSave,
			async () => {
				try {
					// Shared mutation client — CSRF attached automatically (Testing 2026)
					// Uses /api/user/update-roles which calls cms.auth.updateRoles() for
					// full role/permission persistence with validation.
					const { fetchApi } = await import('@utils/api');
					const result = await fetchApi('/api/user/update-roles', {
						method: 'POST',
						body: JSON.stringify(rolesData)
					});

					if (result.success) {
						// Promote the accepted draft to the new baseline so a later Reset
						// restores what is actually persisted.
						savedRoles = $state.snapshot(rolesData);
						draftEpoch += 1;
						toast.success('Configuration updated successfully!');
						hasModifiedChanges = false;
						modifiedCount = 0;
					} else if (result.code === 'HTTP_304') {
						toast.info('No changes detected, configuration not updated.');
					} else {
						toast.error(
							`Error updating configuration: ${result.message || result.error || 'unknown'}`
						);
					}
				} catch (error) {
					logger.error('Network error during save:', error);
					toast.error('Network error occurred while updating configuration.');
				}
			},
			'Saving access control configuration'
		);
	};

	const resetChanges = async () => {
		rolesData = structuredClone(savedRoles);
		hasModifiedChanges = false;
		modifiedCount = 0;
		draftEpoch += 1;
		toast.info('Changes have been reset.');
	};

	// Accessibility: Unsaved changes warning.
	//
	// `cancel()` runs synchronously, so the destination the user picked is still
	// known once the confirmation resolves. A confirmed prompt resumes exactly
	// that navigation through a one-use bypass — without it the first confirmed
	// action only cleared the dirty flag and left the user on this page (audit F04).
	let allowNextNavigation = false;

	/**
	 * Show the discard prompt, then resume the cancelled destination.
	 *
	 * `willUnload` navigations (tab close, cross-document links) belong to the
	 * browser's native beforeunload prompt and cannot be resumed with `goto`.
	 */
	const confirmDiscardAndResume = async (destination: URL | undefined, willUnload: boolean) => {
		const confirmed = await showConfirm({
			title: 'Unsaved Changes',
			body: 'You have unsaved changes in the Access Management configuration. Are you sure you want to leave this page?'
		});
		// Cancel keeps this page and its draft untouched.
		if (!confirmed) return;

		hasModifiedChanges = false;
		modifiedCount = 0;
		toast.info('Changes discarded.');

		if (willUnload || !destination) return;

		allowNextNavigation = true;
		try {
			await goto(destination.href);
		} catch (err) {
			rethrow(err);
			logger.error('Failed to resume navigation after discarding changes', err);
			toast.error('The selected page could not be opened. Please navigate again.');
		} finally {
			allowNextNavigation = false;
		}
	};

	beforeNavigate(({ cancel, to, willUnload }) => {
		if (allowNextNavigation) {
			// Consume the bypass — it covers exactly one resumed navigation.
			allowNextNavigation = false;
			return;
		}
		if (!hasModifiedChanges && !modalState.isOpen) return;

		cancel();
		if (modalState.isOpen) {
			toast.warning('Please close the edit modal before navigating away.');
			return;
		}
		void confirmDiscardAndResume(to?.url, willUnload);
	});
</script>

<AdminPageShell
	title={access_title()}
	icon="mdi:shield-account-outline"
	showBackButton={true}
	backUrl="/config"
>
	{#snippet actions()}
		<!-- Rendered in the PageTitle header (top-right). Deliberately NOT wrapped in
		     StickyActions: with the theme sticky action bar enabled the layout moves
		     these into the bottom-right bar, where the fixed toast region (z-9999) can
		     overlay them and swallow the click (the golden-journey spec also scraps the
		     sticky save in favour of a direct API POST for this reason). The header row
		     is never covered. -->
		<div data-testid="access-mgmt-actions" class="flex flex-wrap items-center gap-2">
			<Button
				variant="primary"
				onclick={saveAllChanges}
				aria-label={access_save_all_aria()}
				data-testid="access-mgmt-save"
				disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
				class="font-semibold shadow-xs"
			>
				{#if globalLoadingStore.isLoadingReason(loadingOperations.configSave)}
					{access_saving()}
				{:else}
					{access_save_count({ count: modifiedCount })}
				{/if}
			</Button>

			<Button
				variant="ghost"
				onclick={resetChanges}
				aria-label={access_reset_changes_aria()}
				data-testid="access-mgmt-reset"
				disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
				class="font-semibold shadow-xs"
			>
				{access_reset()}
			</Button>
		</div>
	{/snippet}

	<AdminCard
		class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card) backdrop-blur-md shadow-xs"
		data-testid="access-mgmt-page"
	>
		<div class="mb-4">
			<p class="text-tertiary-500 dark:text-primary-500 text-sm">
				{access_intro()}
			</p>
		</div>

		<Tabs value={currentTab} onValueChange={(e) => (currentTab = e.value)} class="grow">
			<div data-testid="access-mgmt-tabs">
				<Tabs.List>
					<Tabs.Trigger
						value="0"
						data-testid="access-tab-permissions"
						aria-current={currentTab === '0' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:shield-lock-outline" width="18" height="18" aria-hidden="true"
						></iconify-icon>
						{system_permission()}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="1"
						data-testid="access-tab-roles"
						aria-current={currentTab === '1' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:account-group" width="18" height="18" aria-hidden="true"
						></iconify-icon>
						{system_roles()}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="2"
						data-testid="access-tab-admin"
						aria-current={currentTab === '2' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:account-cog" width="18" height="18" aria-hidden="true"
						></iconify-icon>
						{access_tab_admin()}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="3"
						data-testid="access-tab-tokens"
						aria-current={currentTab === '3' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:web" width="18" height="18" aria-hidden="true"></iconify-icon>
						{access_tab_website_tokens()}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="4"
						data-testid="access-tab-sso"
						aria-current={currentTab === '4' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:shield-key-outline" width="18" height="18" aria-hidden="true"
						></iconify-icon>
						{access_tab_sso()}
					</Tabs.Trigger>

					<!-- Admin-role hint lives in the tab strip: as a centered row inside
					     the permissions tab it duplicated the page title block and pushed
					     the table down. -->
					{#if currentTab === '0' && adminRole}
						<span
							class="ms-auto hidden shrink-0 self-center whitespace-nowrap px-2 text-xs text-(--admin-text-muted) lg:inline"
							data-testid="access-permissions-admin-hint"
						>
							<span class="font-extrabold text-error-500" aria-hidden="true">*</span>
							<span class="font-semibold text-tertiary-600 dark:text-primary-600"
								>{adminRole.name}</span
							>
							{access_permissions_role_all()}
						</span>
					{/if}
				</Tabs.List>
			</div>

			<Tabs.Content value="0">
				<div class="p-2">
					{#if currentTab === '0'}
						<Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} />
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="1">
				<div class="p-2">
					{#if currentTab === '1'}
						<Roles
							roleData={rolesData}
							{setRoleData}
							{updateModifiedCount}
							{draftEpoch}
							permissions={page.data.permissions}
						/>
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="2">
				<div class="p-2">
					{#if currentTab === '2'}
						<AdminRole roleData={rolesData} {setRoleData} />
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="3">
				<div class="p-2">
					{#if currentTab === '3'}
						<WebsiteTokens permissions={page.data.permissions} />
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="4">
				<div class="p-2">
					{#if currentTab === '4'}
						<SsoProviders availableRoles={rolesData} />
					{/if}
				</div>
			</Tabs.Content>
		</Tabs>
	</AdminCard>
</AdminPageShell>
