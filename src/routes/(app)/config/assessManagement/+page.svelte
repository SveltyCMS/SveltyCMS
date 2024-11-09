<!--
@file src/routes/(app)/config/AccessManagement/+page.svelte
@description This page manages the Access Management system, including roles and permissions. 

It provides an interface for users to:
- Navigate between permissions, roles, and admin role management tabs
- View and manage system permissions
- Assign roles and permissions to users
-->

<script lang="ts">
	// Stores
	import { tabSet } from '@stores/store';
	import { page } from '$app/stores';
	import { writable } from 'svelte/store';

	// Auth
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';
	import AdminRole from './AdminRole.svelte'; // New admin role management component

	// Skeleton
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Loading from '@components/Loading.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	let roles = $state($page.data.roles);
	const isLoading = writable(false);

	// Track the number of modified permissions
	const modifiedCount = writable(0);
	const modifiedPermissions = writable(false);

	const setRoleData = (data) => {
		roles = data;
		modifiedPermissions.set(true);
	};

	const updateModifiedCount = (count) => {
		modifiedCount.set(count);
		modifiedPermissions.set(count > 0);
	};

	const saveAllRoles = async () => {
		isLoading.set(true);
		try {
			const response = await fetch('/api/permission/update', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ roles: roles })
			});

			if (response.status === 200) {
				showToast('Config file updated successfully', 'success');
				modifiedPermissions.set(false);
				modifiedCount.set(0);
			} else if (response.status === 304) {
				// Provide a custom message for 304 status
				showToast('No changes detected, config file not updated', 'info');
			} else {
				const responseText = await response.text();
				showToast(`Error updating config file: ${responseText}`, 'error');
			}
		} catch (error) {
			showToast('Network error occurred while updating config file', 'error');
		} finally {
			isLoading.set(false); // Ensure that loading is stopped regardless of success or error
		}
	};

	// Show corresponding Toast messages
	function showToast(message, type) {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}

	const resetChanges = () => {
		modifiedPermissions.set(false);
		modifiedCount.set(0);
	};
</script>

<!-- Page Title and Actions -->
<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<!-- Row 1: Page Title and Back Button (Handled by PageTitle component) -->
	<PageTitle name="Access Management" icon="mdi:account-key" showBackButton={true} backUrl="/config" />

	<!-- Row 2 (on mobile): Save and Reset Buttons -->
	<div class="lgd:mt-0 mt-2 flex items-center justify-center gap-4 lg:justify-end">
		<!-- Save with changes -->
		<button onclick={() => saveAllRoles()} aria-label="Save" class="variant-filled-tertiary btn" disabled={!$modifiedPermissions}>
			Save ({$modifiedCount})
		</button>

		<!-- Reset -->
		<button onclick={resetChanges} aria-label="Reset" class="variant-filled-secondary btn" disabled={!$modifiedPermissions}> Reset </button>
	</div>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-center text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.
	</p>
</div>

{#if $isLoading}
	<Loading customTopText="Loading Admin Role..." customBottomText="" />
{:else}
	<!-- Full height tab group with responsive design -->
	<div class="flex flex-col">
		<TabGroup justify="justify-around text-tertiary-500 dark:text-primary-500" class="flex-grow">
			<!-- User Permissions -->
			<Tab bind:group={$tabSet} name="permissions" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={$tabSet === 0 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_permission()}</span>
				</div>
			</Tab>

			<!-- User Roles -->
			<Tab bind:group={$tabSet} name="roles" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={$tabSet === 1 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_roles()}</span>
				</div>
			</Tab>

			<!-- Admin Role -->
			<Tab bind:group={$tabSet} name="admin" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white"></iconify-icon>
					<span class={$tabSet === 2 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Admin</span>
				</div>
			</Tab>

			<!-- Tab Panels -->
			{#snippet panel()}
					
					{#if $tabSet === 0}
						<Permissions roleData={roles} {setRoleData} {updateModifiedCount} />
					{:else if $tabSet === 1}
						<Roles roleData={roles} {setRoleData} {updateModifiedCount} />
					{:else}
						<AdminRole roleData={roles} {setRoleData} />
					{/if}
				
					{/snippet}
		</TabGroup>
	</div>
{/if}
