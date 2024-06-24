<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionActions, type PermissionAction, type Role, type Permission } from '@src/auth/types';
	import { getPermissions } from '@src/auth/permissionManager';

	let newRoles: Role[] = [];
	let roleName = '';
	let rolePermissions: Record<PermissionAction, boolean> = Object.fromEntries(permissionActions.map((action) => [action, false])) as Record<
		PermissionAction,
		boolean
	>;
	let permissionsList: Permission[] = []; // Explicitly type the permissions array

	onMount(() => {
		permissionsList = getPermissions();

		// Dynamically create rolePermissions based on permissionActions
		permissionActions.forEach((permission) => {
			rolePermissions[permission] = false;
		});
	});

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
			rolePermissions = Object.fromEntries(permissionActions.map((action) => [action, false])) as Record<PermissionAction, boolean>;
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
	<h3>Existing Roles</h3>
	<ul>
		{#each newRoles as role}
			<li>
				{role.name} - {#each role.permissions as permission}{permission.action}{#if permission !== role.permissions[role.permissions.length - 1]},
					{/if}{/each}
			</li>
		{/each}
	</ul>
</div>
