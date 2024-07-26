<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionActions, contextTypes, type PermissionAction, type Permission, type ContextType } from '@src/auth/types';
	import { addPermission, getPermissions } from '@src/auth/permissionManager';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	let contextId = '';
	let action: PermissionAction = 'read';
	let contextType: ContextType = 'collection';
	let requiredRole = '';
	let permissionsList: Permission[] = [];

	onMount(() => {
		loadPermissions();
	});

	function loadPermissions() {
		permissionsList = getPermissions();
	}

	// Function to handle the addition of a new permission
	const addNewPermission = () => {
		if (contextId && requiredRole) {
			addPermission(contextId, action, requiredRole, contextType);
			permissionsList = getPermissions();
			// Reset form
			contextId = '';
			action = 'read';
			contextType = 'collection';
			requiredRole = '';
		}
	};
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Manage Permissions" icon="mdi:shield-lock-outline" />
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-tertiary-500 dark:text-primary-500">
		This page allows you to define and manage permissions for different actions and contexts in the system. Permissions can be assigned to roles to
		control user access.
	</p>
</div>

<div class="card p-4">
	<h3 class="mb-4 text-lg font-semibold">Add New Permission</h3>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
		<input type="text" bind:value={contextId} placeholder="Context ID" class="input" />
		<select bind:value={action} class="select">
			{#each permissionActions as perm}
				<option value={perm}>{perm}</option>
			{/each}
		</select>
		<select bind:value={contextType} class="select">
			{#each contextTypes as type}
				<option value={type}>{type}</option>
			{/each}
		</select>
		<input type="text" bind:value={requiredRole} placeholder="Required Role" class="input" />
	</div>
	<button on:click={addNewPermission} class="variant-filled-primary btn mt-4">Add Permission</button>
</div>

<div class="card mt-8 p-4">
	<h3 class="mb-4 text-lg font-semibold">Existing Permissions</h3>
	{#if permissionsList.length === 0}
		<p class="text-tertiary-500 dark:text-primary-500">No permissions defined yet.</p>
	{:else}
		<table class="table w-full">
			<thead>
				<tr>
					<th>Context ID</th>
					<th>Action</th>
					<th>Context Type</th>
					<th>Required Role</th>
				</tr>
			</thead>
			<tbody>
				{#each permissionsList as permission}
					<tr>
						<td>{permission.contextId}</td>
						<td>{permission.action}</td>
						<td>{permission.contextType}</td>
						<td>{permission.requiredRole}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
