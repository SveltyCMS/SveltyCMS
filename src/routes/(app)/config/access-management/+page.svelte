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
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Tabs from '@components/ui/tabs';
	import { system_permission, system_roles } from '@src/paraglide/messages';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { untrack } from 'svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { modalState } from '@utils/modal.svelte';
	import Button from '@components/ui/button.svelte';

	// Use $state for local component state
	let currentTab = $state('0'); // Initial tab set to string '0' for Tabs component

	// Use $state for page data that needs to be mutable
	let rolesData = $state(untrack(() => page.data.roles)); // Renamed from `roles` to `rolesData` for clarity with internal `roles` in sub-components

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
		rolesData = page.data.roles;
		hasModifiedChanges = false;
		modifiedCount = 0;
		toast.info('Changes have been reset.');
	};

	// Accessibility: Unsaved changes warning
	beforeNavigate(({ cancel }) => {
		if (hasModifiedChanges || modalState.isOpen) {
			cancel();
			if (modalState.isOpen) {
				toast.warning('Please close the edit modal before navigating away.');
				return;
			}
			showConfirm({
				title: 'Unsaved Changes',
				body: 'You have unsaved changes in the Access Management configuration. Are you sure you want to leave this page?',
				onConfirm: () => {
					hasModifiedChanges = false; // Bypass next check
					toast.info('Changes discarded. You can now navigate away.');
				}
			});
		}
	});
</script>

<AdminPageShell
	title="Access Management"
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
				variant="tertiary"
				onclick={saveAllChanges}
				aria-label="Save all changes"
				data-testid="access-mgmt-save"
				disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
				class="font-semibold shadow-xs"
			>
				{#if globalLoadingStore.isLoadingReason(loadingOperations.configSave)}
					Saving...
				{:else}
					Save ({modifiedCount})
				{/if}
			</Button>

			<Button
				variant="ghost"
				onclick={resetChanges}
				aria-label="Reset changes"
				data-testid="access-mgmt-reset"
				disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
				class="font-semibold shadow-xs"
			>
				Reset
			</Button>
		</div>
	{/snippet}

	<AdminCard
		class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs"
		data-testid="access-mgmt-page"
	>
		<div class="mb-4">
			<p class="text-tertiary-500 dark:text-primary-500 text-sm">
				Here you can create and manage user roles and permissions. Each role defines a set of
				permissions that determine what actions users with that role can perform in the system.
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
						Admin
					</Tabs.Trigger>
					<Tabs.Trigger
						value="3"
						data-testid="access-tab-tokens"
						aria-current={currentTab === '3' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:web" width="18" height="18" aria-hidden="true"></iconify-icon>
						Website Tokens
					</Tabs.Trigger>
					<Tabs.Trigger
						value="4"
						data-testid="access-tab-sso"
						aria-current={currentTab === '4' ? 'page' : undefined}
					>
						<iconify-icon icon="mdi:shield-key-outline" width="18" height="18" aria-hidden="true"
						></iconify-icon>
						SSO & OIDC
					</Tabs.Trigger>
				</Tabs.List>
			</div>

			<Tabs.Content value="0">
				<div class="p-2">
					{#if currentTab === '0'}
						{#await import('./permissions.svelte')}
							<p class="text-sm text-surface-500">Loading permissions…</p>
						{:then mod}
							<mod.default roleData={rolesData} {setRoleData} {updateModifiedCount} />
						{/await}
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="1">
				<div class="p-2">
					{#if currentTab === '1'}
						{#await import('./roles.svelte')}
							<p class="text-sm text-surface-500">Loading roles…</p>
						{:then mod}
							<mod.default
								roleData={rolesData}
								{setRoleData}
								{updateModifiedCount}
								permissions={page.data.permissions}
							/>
						{/await}
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="2">
				<div class="p-2">
					{#if currentTab === '2'}
						{#await import('./admin-role.svelte')}
							<p class="text-sm text-surface-500">Loading admin role…</p>
						{:then mod}
							<mod.default roleData={rolesData} {setRoleData} />
						{/await}
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="3">
				<div class="p-2">
					{#if currentTab === '3'}
						{#await import('./website-tokens.svelte')}
							<p class="text-sm text-surface-500">Loading website tokens…</p>
						{:then mod}
							<mod.default permissions={page.data.permissions} />
						{/await}
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="4">
				<div class="p-2">
					{#if currentTab === '4'}
						{#await import('./sso-providers.svelte')}
							<p class="text-sm text-surface-500">Loading SSO providers…</p>
						{:then mod}
							<mod.default availableRoles={rolesData} />
						{/await}
					{/if}
				</div>
			</Tabs.Content>
		</Tabs>
	</AdminCard>
</AdminPageShell>
