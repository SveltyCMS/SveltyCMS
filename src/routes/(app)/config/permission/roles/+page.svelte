<script lang="ts">
	import { onMount } from 'svelte';
	import { type PermissionAction, type Role, type Permission } from '@src/auth/types';
	import { getPermissions } from '@src/auth/permissionManager';
	import { createRandomID } from '@src/utils/utils';

	let newRoles: Role[] = [];
	let roleName = '';
	let rolePermissions: Record<PermissionAction, boolean> = {
		create: false,
		read: false,
		write: false,
		delete: false
	};

	let permissions: Permission[] = [];

	onMount(() => {
		permissions = getPermissions();
	});

	// Function to handle the addition of a new role
	const addRole = async () => {
		const roleData: Omit<Role, 'id' | 'role_id'> = {
			name: roleName,
			permissions: await Promise.all(
				Object.entries(rolePermissions)
					.filter(([_, allowed]) => allowed)
					.map(async ([action]) => ({
						permission_id: await createRandomID(),
						action: action as PermissionAction,
						contextId: 'global', // Example context, adjust as necessary
						contextType: 'collection' // or 'widget', adjust as necessary
					}))
			)
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
		{#each permissions as permission}
			<li>{permission.contextId} - {permission.action}</li>
		{/each}
	</ul>
</div>
