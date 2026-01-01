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
	import { toaster } from '@stores/store.svelte';
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
	let currentTab = $state('0'); // Initial tab set to string '0' for Tabs component

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
						toaster.success({ description: 'Configuration updated successfully!' });
						hasModifiedChanges = false;
						modifiedCount = 0;
					} else if (response.status === 304) {
						toaster.info({ description: 'No changes detected, configuration not updated.' });
					} else {
						const responseText = await response.text();
						toaster.error({ description: `Error updating configuration: ${responseText}` });
					}
				} catch (error) {
					logger.error('Network error during save:', error);
					toaster.error({ description: 'Network error occurred while updating configuration.' });
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
		toaster.info({ description: 'Changes have been reset.' });
	};
</script>

<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<PageTitle name="Access Management" icon="mdi:account-key" showBackButton={true} backUrl="/config" />

	<div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end">
		<button
			onclick={saveAllChanges}
			aria-label="Save all changes"
			class="preset-filled-tertiary-500 btn"
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
			class="preset-filled-secondary-500 btn"
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
	<Tabs value={currentTab} onValueChange={(e) => (currentTab = e.value)} class="grow">
		<Tabs.List class="flex justify-around text-tertiary-500 dark:text-primary-500 border-b border-surface-200-800">
			<Tabs.Trigger value="0" class="flex-1">
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === '0' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{m.system_permission()}</span>
				</div>
			</Tabs.Trigger>
			<Tabs.Trigger value="1" class="flex-1">
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === '1' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{m.system_roles()}</span>
				</div>
			</Tabs.Trigger>
			<Tabs.Trigger value="2" class="flex-1">
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === '2' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Admin</span>
				</div>
			</Tabs.Trigger>
			<Tabs.Trigger value="3" class="flex-1">
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:web" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === '3' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Website Tokens</span>
				</div>
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="0">
			<div class="p-4">
				<Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} />
			</div>
		</Tabs.Content>
		<Tabs.Content value="1">
			<div class="p-4">
				<Roles roleData={rolesData} {setRoleData} {updateModifiedCount} />
			</div>
		</Tabs.Content>
		<Tabs.Content value="2">
			<div class="p-4">
				<AdminRole roleData={rolesData} {setRoleData} />
			</div>
		</Tabs.Content>
		<Tabs.Content value="3">
			<div class="p-4">
				<WebsiteTokens />
			</div>
		</Tabs.Content>
	</Tabs>
</div>
