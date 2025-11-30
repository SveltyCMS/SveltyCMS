<!--
@file src/routes/(app)/config/AccessManagement/+page.svelte
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
	import { page } from '$app/state';
	import { showToast } from '@utils/toast';
	import { logger } from '@utils/logger';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Auth components for tabs (assuming they are optimized internally)
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';
	import AdminRole from './AdminRole.svelte';
	import WebsiteTokens from './WebsiteTokens.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Use $state for local component state
	let currentTab = $state('permissions'); // Initial tab set to 'permissions'

	// Use $state for page data that needs to be mutable
	let rolesData = $state(page.data.roles); // Renamed from `roles` to `rolesData` for clarity with internal `roles` in sub-components

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
					// Send the `rolesData` (which includes modifications from children) to the API
					const response = await fetch('/api/permission/update', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ roles: rolesData })
					});

					if (response.status === 200) {
						showToast('Configuration updated successfully!', 'success');
						hasModifiedChanges = false;
						modifiedCount = 0;
					} else if (response.status === 304) {
						showToast('No changes detected, configuration not updated.', 'info');
					} else {
						const responseText = await response.text();
						showToast(`Error updating configuration: ${responseText}`, 'error');
					}
				} catch (error) {
					logger.error('Network error during save:', error);
					showToast('Network error occurred while updating configuration.', 'error');
				}
			},
			'Saving access control configuration'
		);
	};

	const resetChanges = async () => {
		// A more robust reset would re-fetch the initial data from the server or
		// store a deep copy of the original data. For simplicity here, we assume
		// `page.data.roles` holds the original state if we just reset `rolesData`.
		rolesData = page.data.roles; // Reset to initial loaded state
		hasModifiedChanges = false;
		modifiedCount = 0;
		showToast('Changes have been reset.', 'info');
	};
</script>

<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<PageTitle name="Access Management" icon="mdi:account-key" showBackButton={true} backUrl="/config" />

	<div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end">
		<button
			onclick={saveAllChanges}
			aria-label="Save all changes"
			class="variant-filled-tertiary btn"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		>
			{#if globalLoadingStore.isLoadingReason(loadingOperations.configSave)}
				Saving...
			{:else}
				Save ({modifiedCount})
			{/if}
		</button>

		<button
			onclick={resetChanges}
			aria-label="Reset changes"
			class="variant-filled-secondary btn"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		>
			Reset
		</button>
	</div>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-center text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.
	</p>
</div>

<div class="flex flex-col">
	<Tabs value={currentTab} onValueChange={(details) => currentTab = details.value} class="flex-grow justify-around text-tertiary-500 dark:text-primary-500">
		<Tabs.List>
			<Tabs.Trigger value="permissions">
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 'permissions' ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_permission()}</span>
				</div>
			</Tabs.Trigger>

			<Tabs.Trigger value="roles">
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 'roles' ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_roles()}</span>
				</div>
			</Tabs.Trigger>

			<Tabs.Trigger value="admin">
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 'admin' ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Admin</span>
				</div>
			</Tabs.Trigger>

			<Tabs.Trigger value="websites">
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:web" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 'websites' ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Website Tokens</span>
				</div>
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="permissions">
			<Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} />
		</Tabs.Content>
		<Tabs.Content value="roles">
			<Roles roleData={rolesData} {setRoleData} {updateModifiedCount} />
		</Tabs.Content>
		<Tabs.Content value="admin">
			<AdminRole roleData={rolesData} {setRoleData} />
		</Tabs.Content>
		<Tabs.Content value="websites">
			<WebsiteTokens />
		</Tabs.Content>
	</Tabs>
</div>
