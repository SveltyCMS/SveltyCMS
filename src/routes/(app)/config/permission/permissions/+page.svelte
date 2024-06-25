<!-- src/routes/permission/permissions/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { permissions as permissionList, type PermissionAction, type ContextType, type Permission } from '@src/auth/types';
	import { addPermission, getPermissions } from '@src/auth/permissionManager';

	let contextId = '';
	let action: PermissionAction = 'read';
	let contextType: ContextType = 'collection';
	let permissions: Permission[] = [];

	onMount(() => {
		permissions = getPermissions();
	});

	// Function to handle the addition of a new permission
	const addNewPermission = () => {
		addPermission(contextId, action, 'admin', contextType);
		permissions = getPermissions();
	};
</script>

<div>
	<h2>Manage Permissions</h2>
	<input type="text" bind:value={contextId} placeholder="Context ID" />
	<select bind:value={action}>
		{#each permissionList as perm}
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
		{#each permissions as permission}
			<li>{permission.contextId} - {permission.action}</li>
		{/each}
	</ul>
</div>
