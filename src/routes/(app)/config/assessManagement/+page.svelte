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

<TabGroup justify="justify-around text-tertiary-500 dark:text-primary-500">
	<!-- User Permissions -->
	<Tab bind:group={$tabSet} name="permissions" value={0}>
		<svelte:fragment slot="lead">
			<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white" />
		</svelte:fragment>
		<span class={$tabSet === 0 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_permission()}</span>
	</Tab>

	<!-- User Roles -->
	<Tab bind:group={$tabSet} name="roles" value={1}>
		<svelte:fragment slot="lead">
			<iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white" />
		</svelte:fragment>
		<span class={$tabSet === 1 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>{m.system_roles()}</span>
	</Tab>

	<!-- Admin Role -->
	<Tab bind:group={$tabSet} name="admin" value={2}>
		<svelte:fragment slot="lead">
			<iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white" />
		</svelte:fragment>
		<span class={$tabSet === 2 ? 'text-secondary-500 dark:text-tertiary-500' : ''}>Admin Role</span>
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
