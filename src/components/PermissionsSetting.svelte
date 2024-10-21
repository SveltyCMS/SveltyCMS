<!-- 
@file src/components/PermissionsSetting.svelte
@description Permissions Setting Component for managing role-based permissions

Features:
- Fetches and displays roles with their permissions
- Allows adding new roles
- Enables toggling permissions for non-admin roles
- Provides search functionality for roles
- Responsive design with accessibility improvements
- Enhanced error handling and loading states
- Styled using Tailwind CSS
-->

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	// Auth
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
		isAdmin: boolean; // Handle admin roles
		permissions: Partial<Record<PermissionAction, boolean>>;
	}

	let rolesArray: RoleWithPermissions[] = [];
	let allRoles: string[] = [];
	let isLoading = true;
	let searchQuery = '';
	let error: string | null = null;

	onMount(async () => {
		try {
			// Wait for the initialization promise to resolve
			await initializationPromise;
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}

			const fetchedRoles = await authAdapter.getAllRoles();
			updateRolesArray(fetchedRoles);
			allRoles = fetchedRoles.map((role) => role.name);
		} catch (err) {
			console.error('Failed to fetch roles:', err);
			error = err instanceof Error ? err.message : 'An unknown error occurred';
			toastStore.trigger({
				message: 'Failed to fetch roles',
				background: 'variant-filled-error'
			});
		} finally {
			isLoading = false;
		}
	});

	// Function to update the roles array
	function updateRolesArray(fetchedRoles: Role[]): void {
		rolesArray = fetchedRoles.map((role) => ({
			name: role.name,
			isAdmin: role.isAdmin ?? false,
			permissions: convertPermissionsArray(role.permissions)
		}));
	}

	// Function to convert an array of permission IDs to an object with boolean values
	function convertPermissionsArray(permissionIds: string[]): Partial<Record<PermissionAction, boolean>> {
		return Object.values(PermissionAction).reduce(
			(acc, action) => {
				acc[action] = permissionIds.includes(action);
				return acc;
			},
			{} as Partial<Record<PermissionAction, boolean>>
		);
	}

	// Function to toggle a permission for a role
	function togglePermission(roleName: string, permission: PermissionAction): void {
		const role = rolesArray.find((r) => r.name === roleName);
		if (role && !role.isAdmin) {
			// Prevent toggling permissions for admin roles
			role.permissions[permission] = !role.permissions[permission];
			dispatch('update', { [roleName]: role.permissions });
		} else if (role?.isAdmin) {
			toastStore.trigger({
				message: 'Cannot modify permissions for admin role',
				background: 'variant-filled-warning'
			});
		}
	}

	// Add a new role dynamically with default permissions
	async function addRole(): Promise<void> {
		if (!authAdapter) {
			toastStore.trigger({
				message: 'Auth system is not initialized',
				background: 'variant-filled-error'
			});
			return;
		}

		const existingRoles = new Set(rolesArray.map((r) => r.name));
		const availableRoles = allRoles.filter((role) => !existingRoles.has(role));

		if (availableRoles.length > 0) {
			const newRole: RoleWithPermissions = {
				name: availableRoles[0],
				isAdmin: false,
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
{:else if error}
	<div class="p-4 text-center text-error-500" role="alert">
		<p>Error: {error}</p>
		<button on:click={() => location.reload()} class="variant-filled-primary btn mt-2">Retry</button>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<h2 class="text-2xl font-bold">Manage Permissions</h2>
		<div class="flex flex-col gap-4 sm:flex-row">
			<input bind:value={searchQuery} placeholder="Search roles..." class="input flex-grow" aria-label="Search roles" />
			<button on:click={addRole} class="variant-filled-primary btn">Add Role</button>
		</div>

		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th scope="col" class="px-4 py-2">Role</th>
						{#each Object.values(PermissionAction) as permission}
							<th scope="col" class="px-4 py-2">{permission}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each filteredRolesArray as role (role.name)}
						<tr>
							<th scope="row" class="px-4 py-2">{role.name}</th>
							{#each Object.values(PermissionAction) as permission}
								<td class="px-4 py-2">
									<button
										on:click={() => togglePermission(role.name, permission)}
										class={`btn ${role.permissions[permission] ? 'variant-filled-success' : 'variant-filled-error'}`}
										disabled={role.isAdmin}
										aria-label={`${role.permissions[permission] ? 'Disable' : 'Enable'} ${permission} for ${role.name}`}
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
	</div>
{/if}
