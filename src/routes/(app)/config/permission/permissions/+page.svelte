<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionActions, type PermissionAction, type Permission } from '@src/auth/types';
	import { addPermission, getPermissions } from '@src/auth/permissionManager';

	let contextId = '';
	let action: PermissionAction = 'read';
	let contextType: 'collection' | 'widget' = 'collection';
	let permissionsList: Permission[] = [];

	onMount(() => {
		permissionsList = getPermissions();
	});

	// Function to handle the addition of a new permission
	const addNewPermission = () => {
		// Correct the arguments passed to addPermission
		addPermission(contextId, action, 'admin', contextType);
		permissionsList = getPermissions();
	};
</script>

<div>
	<h2>Manage Permissions</h2>
	<input type="text" bind:value={contextId} placeholder="Context ID" />
	<select bind:value={action}>
		{#each permissionActions as perm}
			<option value={perm}>{perm}</option>
		{/each}
	</select>
	<select bind:value={contextType}>
		<option value="collection">Collection</option>
		<option value="widget">Widget</option>
	</select>
	<button on:click={addNewPermission}>Add Permission</button>
	<h3>Existing Permissions</h3>
	<ul>
		{#each permissionsList as permission}
			<li>{permission.contextId} - {permission.action}</li>
		{/each}
	</ul>
</div>
