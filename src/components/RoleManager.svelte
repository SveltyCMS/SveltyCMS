<script lang="ts">
	import { onMount } from 'svelte';
	import { roles, permissions } from '@src/auth/roles';

	let newRoles = [];
	let roleName = '';
	let rolePermissions = { create: false, read: false, write: false, delete: false };

	const addRole = async () => {
		const response = await fetch('/api/roles/update-roles', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roles: [...newRoles, { name: roleName, permissions: rolePermissions }] })
		});

		if (response.ok) {
			newRoles = [];
			roleName = '';
			rolePermissions = { create: false, read: false, write: false, delete: false };
		}
	};
</script>

<div>
	<h2>Manage Roles</h2>
	<input type="text" bind:value={roleName} placeholder="Role Name" />
	<div>
		{#each permissions as permission}
			<label>
				<input type="checkbox" bind:checked={rolePermissions[permission]} />
				{permission}
			</label>
		{/each}
	</div>
	<button on:click={addRole}>Add Role</button>
</div>
