<script lang="ts">
	import { onMount } from 'svelte';
	import { permissionActions, contextTypes, roles, type PermissionAction, type Permission, type ContextType, type Role } from '@src/auth/types';
	import { addPermission, getPermissions, updatePermission } from '@src/auth/permissionManager';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	let permissionsList: Permission[] = [];
	let modifiedPermissions: Set<string> = new Set();
	let searchTerm = '';

	$: filteredPermissions = permissionsList.filter((permission) => permission.contextId.toLowerCase().includes(searchTerm.toLowerCase()));

	onMount(() => {
		loadPermissions();
	});

	function loadPermissions() {
		permissionsList = getPermissions();
	}

	function toggleRole(permission: Permission, role: string) {
		const currentRoles = permission.requiredRole.split(',').map((r) => r.trim());
		if (currentRoles.includes(role)) {
			permission.requiredRole = currentRoles.filter((r) => r !== role).join(',');
		} else {
			permission.requiredRole = [...currentRoles, role].join(',');
		}
		modifiedPermissions.add(permission.permission_id);
		modifiedPermissions = modifiedPermissions;
	}

	async function saveChanges() {
		for (const permissionId of modifiedPermissions) {
			const permission = permissionsList.find((p) => p.permission_id === permissionId);
			if (permission) {
				await updatePermission(permission);
			}
		}
		modifiedPermissions.clear();
		loadPermissions();
	}
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Manage Permissions" icon="mdi:shield-lock-outline" />
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-tertiary-500 dark:text-primary-500">
		This page allows you to manage permissions for different actions and contexts in the system. Permissions can be assigned to multiple roles to
		control user access.
	</p>
</div>

<div class="card mt-8 p-4">
	<h3 class="mb-4 text-lg font-semibold">Existing Permissions</h3>
	<div class="mb-4">
		<input type="text" bind:value={searchTerm} placeholder="Search permissions..." class="input w-full" />
	</div>
	{#if filteredPermissions.length === 0}
		<p class="text-tertiary-500 dark:text-primary-500">
			{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
		</p>
	{:else}
		<table class="compact table w-full">
			<thead class="text-tertiary-500 dark:text-primary-500">
				<tr class="divide-x">
					<th>Permission ID</th>
					<th>Action</th>
					<th>Type</th>
					{#each roles as role}
						<th>{role}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each filteredPermissions as permission}
					<tr class="divide-x">
						<td>{permission.contextId}</td>
						<td>{permission.action}</td>
						<td>{permission.contextType}</td>
						{#each roles as role}
							<td class="text-center">
								<input
									type="checkbox"
									checked={permission.requiredRole
										.split(',')
										.map((r) => r.trim())
										.includes(role)}
									on:change={() => toggleRole(permission, role)}
								/>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if modifiedPermissions.size > 0}
		<div class="mt-4 text-right">
			<button on:click={saveChanges} class="variant-filled-primary btn">
				Save Changes ({modifiedPermissions.size})
			</button>
		</div>
	{/if}
</div>
