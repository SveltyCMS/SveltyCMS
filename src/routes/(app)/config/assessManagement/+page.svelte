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

	let roles = $page.data.roles;
	const isLoading = writable(false);

	const setRoleData = (data) => {
		roles = data;
	};

	const saveAllRoles = async () => {
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
			} else if (response.status === 304) {
				// Provide a custom message for 304 status
				showToast('No changes detected, config file not updated', 'info');
			} else {
				const responseText = await response.text();
				showToast(`Error updating config file: ${responseText}`, 'error');
			}
			isLoading.set(true);
		} catch (error) {
			showToast('Network error occurred while updating config file', 'error');
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
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name="Access Management" icon="mdi:account-key" />

	<!-- Back -->
	<div class="justify-right flex gap-8">
		<button on:click={() => saveAllRoles()} aria-label="Save" class="variant-filled-tertiary btn"> Save Changes </button>
		<button on:click={() => history.back()} aria-label="Go back" class="variant-outline-primary btn-icon">
			<iconify-icon icon="ri:arrow-left-line" width="20" />
		</button>
	</div>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class=" text-center text-tertiary-500 dark:text-primary-500">
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
					<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white" />
					<span class={$tabSet === 0 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_permission()}</span>
				</div>
			</Tab>

			<!-- User Roles -->
			<Tab bind:group={$tabSet} name="roles" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white" />
					<span class={$tabSet === 1 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_roles()}</span>
				</div>
			</Tab>

			<!-- Admin Role -->
			<Tab bind:group={$tabSet} name="admin" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white" />
					<span class={$tabSet === 2 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Admin Role</span>
				</div>
			</Tab>

			<!-- Tab Panels -->
			<svelte:fragment slot="panel">
				{#if $tabSet === 0}
					<Permissions roleData={roles} {setRoleData} />
				{:else if $tabSet === 1}
					<Roles roleData={roles} {setRoleData} />
				{:else}
					<AdminRole roleData={roles} {setRoleData} />
				{/if}
			</svelte:fragment>
		</TabGroup>
	</div>
{/if}

<style>
	/* Ensure full height utilization with responsiveness */
	.flex-grow {
		flex: 1 1 auto;
	}
	.h-full {
		height: 100%;
	}
	.overflow-auto {
		overflow: auto;
	}
	.p-4 {
		padding: 1rem;
	}
</style>
