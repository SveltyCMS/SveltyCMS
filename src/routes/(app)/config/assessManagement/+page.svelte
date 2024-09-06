<!--
@file src/routes/(app)/config/AccessManagement/+page.svelte
@description This page manages the Access Management system, including roles and permissions. 

It provides an interface for users to:
- Navigate between permissions, roles, and admin role management tabs
- View and manage system permissions
- Assign roles and permissions to users
-->

<script lang="ts">
	import { tabSet } from '@stores/store';

	// Auth
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';
	import AdminRole from './AdminRole.svelte'; // New admin role management component

	// Skeleton
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name="Access Management" icon="mdi:account-key" />

	<!-- Back -->
	<button on:click={() => history.back()} aria-label="Go back" class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class=" text-center text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.
	</p>
</div>

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
				<Permissions />
			{:else if $tabSet === 1}
				<Roles />
			{:else}
				<AdminRole />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

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
