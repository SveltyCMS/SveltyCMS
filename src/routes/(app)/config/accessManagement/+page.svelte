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
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Loading from '@components/Loading.svelte';

	// Auth components for tabs (assuming they are optimized internally)
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';
	import AdminRole from './AdminRole.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	const toastStore = getToastStore();

	// Use $state for local component state
	let currentTab = $state(0); // Initial tab set to 0 (Permissions)

	// Use $state for page data that needs to be mutable
	let rolesData = $state(page.data.roles); // Renamed from `roles` to `rolesData` for clarity with internal `roles` in sub-components

	let isLoading = $state(false); // Global loading state for the page's save operation

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
		isLoading = true; // Use $state directly
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
			console.error('Network error during save:', error);
			showToast('Network error occurred while updating configuration.', 'error');
		} finally {
			isLoading = false; // Ensure loading state is reset
		}
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

	// Helper for toast notifications
	function showToast(message: string, type: 'success' | 'info' | 'error') {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}
</script>

<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<PageTitle name="Access Management" icon="mdi:account-key" showBackButton={true} backUrl="/config" />

	<div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end">
		<button onclick={saveAllChanges} aria-label="Save all changes" class="variant-filled-tertiary btn" disabled={!hasModifiedChanges || isLoading}>
			{#if isLoading}
				Saving...
			{:else}
				Save ({modifiedCount})
			{/if}
		</button>

		<button onclick={resetChanges} aria-label="Reset changes" class="variant-filled-secondary btn" disabled={!hasModifiedChanges || isLoading}>
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

{#if isLoading && currentTab === -1}
	<Loading customTopText="Saving changes..." />
{:else}
	<div class="flex flex-col">
		<TabGroup justify="justify-around text-tertiary-500 dark:text-primary-500" class="flex-grow">
			<Tab bind:group={currentTab} name="permissions" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white" ></iconify-icon>
					<span class={currentTab === 0 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_permission()}</span>
				</div>
			</Tab>

			<Tab bind:group={currentTab} name="roles" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 1 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_roles()}</span>
				</div>
			</Tab>

			<Tab bind:group={currentTab} name="admin" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={currentTab === 2 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Admin</span>
				</div>
			</Tab>

			<svelte:fragment slot="panel">
				{#if currentTab === 0}
					<Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} />
				{:else if currentTab === 1}
					<Roles roleData={rolesData} {setRoleData} {updateModifiedCount} />
				{:else}
					<AdminRole roleData={rolesData} {setRoleData} />
				{/if}
			</svelte:fragment>
		</TabGroup>
	</div>
{/if}
