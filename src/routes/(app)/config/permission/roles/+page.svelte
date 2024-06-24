<!-- src/routes/permission/roles/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionsAction, type PermissionAction, type Role } from '@src/auth/types';
	import { getPermissions } from '@src/auth/permissionManager';

	let newRoles: Role[] = [];
	let roleName = '';
	let rolePermissions: Record<PermissionAction, boolean> = {};

	onMount(() => {
		permissionsAction = getPermissions();

		// Dynamically create rolePermissions based on permissionList
		permissionsAction.forEach((permission) => {
			rolePermissions[permission] = false;
		});
	});

	let permissionsAction: Permission[] = []; // Explicitly type the permissions array

	// Function to handle the addition of a new role
	const addRole = async () => {
		const roleData: Omit<Role, 'id'> = {
			name: roleName,
			permissions: Object.entries(rolePermissions)
				.filter(([_, allowed]) => allowed)
				.map(([action]) => ({
					id: crypto.randomUUID(),
					action: action as PermissionAction,
					contextId: 'global', // Example context, adjust as necessary
					contextType: 'collection' // or 'widget', adjust as necessary
				}))
		};

		const response = await fetch('/api/roles', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(roleData)
		});

		if (response.ok) {
			roleName = '';
			rolePermissions = { create: false, read: false, write: false, delete: false };
			const updatedRole: Role = await response.json();
			newRoles.push(updatedRole);
		} else {
			console.error('Failed to add the role');
		}
	};
</script>

<div>
	<h2>Manage Roles</h2>
	<input type="text" bind:value={roleName} placeholder="Role Name" />
	<div>
		{#each Object.entries(rolePermissions) as [permission, _]}
			<label>
				<input type="checkbox" bind:checked={rolePermissions[permission]} />
				{permission}
			</label>
		{/each}
	</div>
	<button on:click={addRole}>Add Role</button>
	<h3>Existing Permissions</h3>
	<ul>
		{#each permissionsAction as permission}
			<li>{permission.contextId} - {permission.action}</li>
		{/each}
	</ul>
</div>
