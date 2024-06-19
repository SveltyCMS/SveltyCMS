<script lang="ts">
	import { onMount } from 'svelte';
	import { permissions as permissionList, type PermissionAction, type Role } from '@src/auth/types';

	let newRoles: Role[] = [];
	let roleName = '';
	let rolePermissions: Record<PermissionAction, boolean> = {
		create: false,
		read: false,
		write: false,
		delete: false
	};

	// Function to handle the addition of a new role
	const addRole = async () => {
		// Prepare the new role data for the API, omitting the ID for permissions
		const roleData = {
			name: roleName,
			permissions: Object.entries(rolePermissions)
				.filter(([_, allowed]) => allowed)
				.map(([action]) => ({
					action,
					contextId: 'global', // Example context, adjust as necessary
					contextType: 'global' // Same here
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
			// Optionally fetch and update roles list from server response
			const updatedRole = await response.json();
			newRoles.push(updatedRole); // Assuming the backend returns the newly created role with IDs
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
</div>
