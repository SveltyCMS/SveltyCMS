<script lang="ts">
	import { roles, permissionActions as PermissionsEnum, icon, color } from '@src/auth/types';
	import type { Role, PermissionAction } from '@src/auth/types';

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	// Skeleton Toast for notifications
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Localized messages
	import * as m from '@src/paraglide/messages';

	// Permissions are assumed to be passed in or fetched dynamically
	export let permissions = {};

	// Initialize rolesArray dynamically based on provided permissions
	let rolesArray: { name: string; permissions: { [key in PermissionAction]?: boolean } }[] = [];

	$: rolesArray = Object.entries(permissions).map(([role, perms]) => ({
		name: role,
		permissions: perms || { create: false, read: false, write: false, delete: false }
	}));

	// Toggle specific permission for a role
	function togglePermission(roleName: string, permission: PermissionAction) {
		const role = rolesArray.find((r) => r.name === roleName);
		if (role && role.permissions[permission] !== undefined) {
			role.permissions[permission] = !role.permissions[permission];
			dispatch('update', { [roleName]: role.permissions });
		}
	}

	// Add a new role dynamically with default permissions
	function addRole() {
		const existingRoles = rolesArray.map((r) => r.name);
		const availableRoles = roles.filter((r) => !existingRoles.includes(r));
		if (availableRoles.length > 0) {
			rolesArray.push({
				name: availableRoles[0],
				permissions: { create: false, read: true, write: false, delete: false }
			});
			dispatch('update', rolesArray);
		} else {
			toastStore.trigger({
				message: 'All roles have been added',
				background: 'gradient-tertiary',
				timeout: 3000
			});
		}
	}

	let searchQuery = '';

	// Filter roles based on search query
	$: {
		const lowerCaseQuery = searchQuery.toLowerCase();
		rolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(lowerCaseQuery));
	}
</script>

<div>
	<h2>Manage Permissions</h2>
	<input bind:value={searchQuery} placeholder="Search roles..." class="input" />
	<button on:click={addRole} class="btn-primary btn">Add Role</button>

	<table class="table">
		<!-- Table Header -->
		<thead>
			<tr>
				<th>Role</th>
				{#each PermissionsEnum as permission}
					<th>{permission}</th>
				{/each}
			</tr>
		</thead>
		<!-- Table Body -->
		<tbody>
			{#each rolesArray as role}
				<tr>
					<!-- Role Name -->
					<td>{role.name}</td>
					{#each PermissionsEnum as permission}
						<td>
							<button
								on:click={() => togglePermission(role.name, permission)}
								class={`btn ${role.permissions[permission] ? 'btn-success' : 'btn-error'}`}
							>
								{icon[permission]}
							</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
