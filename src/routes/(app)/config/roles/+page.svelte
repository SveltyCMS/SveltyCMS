<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionActions, type PermissionAction, type Role, type Permission } from '@src/auth/types';
	import { getPermissions } from '@src/auth/permissionManager';
	import { createRandomID } from '@src/utils/utils';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	let roles: Role[] = [];
	let roleName = '';
	let rolePermissions: Record<PermissionAction, boolean> = {
		create: false,
		read: false,
		write: false,
		delete: false
	};

	let permissions: Permission[] = [];

	onMount(async () => {
		permissions = getPermissions();
		await loadRoles();
	});

	async function loadRoles() {
		const response = await fetch('/api/roles');
		if (response.ok) {
			roles = await response.json();
		} else {
			console.error('Failed to load roles');
		}
	}

	// Function to handle the addition of a new role
	const addRole = async () => {
		if (!roleName) return;

		const roleData: Omit<Role, 'role_id'> = {
			name: roleName,
			permissions: await Promise.all(
				Object.entries(rolePermissions)
					.filter(([_, allowed]) => allowed)
					.map(async ([action]) => ({
						permission_id: await createRandomID(),
						action: action as PermissionAction,
						contextId: 'global',
						contextType: 'system',
						requiredRole: roleName, // Add this line
						description: `${roleName} can ${action} globally` // Optional: add a description
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
			await loadRoles();
		} else {
			console.error('Failed to add the role');
		}
	};
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Manage Roles" icon="mdi:account-group" />
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles. Each role defines a set of permissions that determine what actions users with that role can perform in
		the system.
	</p>
</div>

<div class="card p-4">
	<h3 class="mb-4 text-lg font-semibold">Add New Role</h3>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<input type="text" bind:value={roleName} placeholder="Role Name" class="input" />
		<div class="flex flex-wrap gap-2">
			{#each permissionActions as permission}
				<label class="flex items-center">
					<input type="checkbox" bind:checked={rolePermissions[permission]} class="checkbox" />
					<span class="ml-2">{permission}</span>
				</label>
			{/each}
		</div>
	</div>
	<button on:click={addRole} class="variant-filled-primary btn mt-4">Add Role</button>
</div>

<div class="card mt-8 p-4">
	<h3 class="mb-4 text-lg font-semibold">Existing Roles</h3>
	{#if roles.length === 0}
		<p class="text-tertiary-500 dark:text-primary-500">No roles defined yet.</p>
	{:else}
		<table class="table w-full">
			<thead>
				<tr>
					<th>Role Name</th>
					<th>Permissions</th>
				</tr>
			</thead>
			<tbody>
				{#each roles as role}
					<tr>
						<td>{role.name}</td>
						<td>
							{role.permissions.map((p) => p.action).join(', ')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
