<!-- 
@file src/components/PermissionsSetting.svelte
@description - The Permissions Setting
-->

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { icon, type Role } from '@src/auth/types';
	import { PermissionAction } from '@root/config/permissions';
	import { authAdapter, initializationPromise } from '@src/databases/db';

	// Components
	import Loading from '@components/Loading.svelte';
	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';

	const dispatch = createEventDispatcher();
	const toastStore = getToastStore();

	// Define the type for a role with permissions
	interface RoleWithPermissions {
		name: string;
		isAdmin?: boolean; // Handle admin roles
		permissions: Partial<Record<PermissionAction, boolean>>;
	}

	export let permissions: Record<string, Partial<Record<PermissionAction, boolean>>> = {};

	let rolesArray: RoleWithPermissions[] = [];
	let allRoles: string[] = [];
	let isLoading = true;
	let searchQuery = '';

	onMount(async () => {
		try {
			// Wait for the initialization promise to resolve
			await initializationPromise;
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}

			const fetchedRoles = await authAdapter.getAllRoles();
			// Continue with role fetching logic
		} catch (error) {
			console.error('Failed to fetch roles:', error);
			toastStore.trigger({
				message: 'Failed to fetch roles',
				background: 'variant-filled-error'
			});
		} finally {
			isLoading = false;
		}
	});

	function updateRolesArray(fetchedRoles: Role[]) {
		rolesArray = fetchedRoles.map((role) => ({
			name: role.name,
			isAdmin: role.isAdmin,
			permissions: convertPermissionsArray(role.permissions) // Convert permissions array to the expected format
		}));
	}

	// Function to convert string[] permissions to Partial<Record<PermissionAction, boolean>>
	function convertPermissionsArray(permissionIds: string[]): Partial<Record<PermissionAction, boolean>> {
		const permissionsObj: Partial<Record<PermissionAction, boolean>> = {};

		Object.values(PermissionAction).forEach((action) => {
			permissionsObj[action] = permissionIds.includes(action);
		});

		return permissionsObj;
	}

	// Toggle specific permission for a role
	function togglePermission(roleName: string, permission: PermissionAction) {
		const role = rolesArray.find((r) => r.name === roleName);
		if (role && !role.isAdmin) {
			// Prevent toggling permissions for admin roles
			role.permissions[permission] = !role.permissions[permission];
			dispatch('update', { [roleName]: role.permissions });
		} else if (role && role.isAdmin) {
			toastStore.trigger({
				message: 'Cannot modify permissions for admin role',
				background: 'variant-filled-warning'
			});
		}
	}

	// Add a new role dynamically with default permissions
	async function addRole() {
		if (!authAdapter) {
			toastStore.trigger({
				message: 'Auth system is not initialized',
				background: 'variant-filled-error'
			});
			return;
		}

		const existingRoles = rolesArray.map((r) => r.name);
		const availableRoles = allRoles.filter((role) => !existingRoles.includes(role));

		if (availableRoles.length > 0) {
			const newRole = {
				name: availableRoles[0],
				permissions: Object.fromEntries(Object.values(PermissionAction).map((action) => [action, false]))
			};
			rolesArray = [...rolesArray, newRole];
			dispatch('update', { [newRole.name]: newRole.permissions });
		} else {
			toastStore.trigger({
				message: 'All roles have been added',
				background: 'variant-filled-warning'
			});
		}
	}

	// Filter roles based on search query
	$: filteredRolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
</script>

{#if isLoading}
	<Loading customTopText="Fetching Roles" customBottomText="Loading Permissions" />
{:else}
	<div>
		<h2>Manage Permissions</h2>
		<input bind:value={searchQuery} placeholder="Search roles..." class="input" />
		<button on:click={addRole} class="variant-filled-primary btn">Add Role</button>

		<table class="table">
			<thead>
				<tr>
					<th>Role</th>
					{#each Object.values(PermissionAction) as permission}
						<th>{permission}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each filteredRolesArray as role}
					<tr>
						<td>{role.name}</td>
						{#each Object.values(PermissionAction) as permission}
							<td>
								<button
									on:click={() => togglePermission(role.name, permission)}
									class={`btn ${role.permissions[permission] ? 'variant-filled-success' : 'variant-filled-error'}`}
									disabled={role.isAdmin}
								>
									<iconify-icon icon={icon[permission]} />
								</button>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
