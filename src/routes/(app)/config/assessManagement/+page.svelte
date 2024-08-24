<!-- 
@files src/routes/(app)/config/assessManagement/+page.svelte
@description This file sets up and displays the assess management page. 
It provides a user-friendly interface for searching, filtering, and navigating through roles and permissions. 
-->

<script lang="ts">
	// Store
	import { page } from '$app/stores';
	import { tabSet } from '@stores/store';

	// Auth
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';

	// Skeleton
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Page Title -->
<div class="my-2 flex flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
	<PageTitle name="Access Management" icon="mdi:account-key" />

	<!-- Back -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.
	</p>
</div>

<TabGroup justify="justify-center">
	<!-- User Roles -->
	<Tab bind:group={$tabSet} name="roles" value={0}>
		<svelte:fragment slot="lead">
			<iconify-icon icon="mdi:account-group" width="28" class="text-white" />
		</svelte:fragment>
		<span>{m.system_roles()}</span>
	</Tab>

	<!-- User Permissions-->
	<Tab bind:group={$tabSet} name="permissions" value={1}>
		<svelte:fragment slot="lead">
			<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-white" />
		</svelte:fragment>
		<span>{m.system_permission()}</span>
	</Tab>

	<!-- Tab Panels --->
	<svelte:fragment slot="panel">
		{#if $tabSet === 0}
			<Roles />
		{:else}
			<Permissions />
		{/if}
	</svelte:fragment>
</TabGroup>
