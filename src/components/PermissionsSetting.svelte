<!-- 
@file src/components/PermissionsSetting.svelte
@description Permissions Setting Component for managing role-based permissions
Features:
- Enables toggling permissions for non-admin roles
- Provides search functionality for roles
- Allows adding new roles
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	// Auth
	import type { Role } from '@src/auth/types';
	import { icon } from '@src/auth/types';
	import { PermissionAction } from '@src/auth/permissionTypes';

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';

	const dispatch = createEventDispatcher();
	const toastStore = getToastStore();

	// Props
	export let roles: Role[] = [];
	export let permissions: any;

	// Define the type for a role with permissions
	interface RoleWithPermissions {
		name: string;
		isAdmin: boolean; // Handle admin roles
		permissions: Partial<Record<PermissionAction, boolean>>;
	}

	let rolesArray: RoleWithPermissions[] = [];
	let allRoles: string[] = [];
	let searchQuery = '';
	let error: string | null = null;

	// Function to add a new role
	function addRole() {
		const availableRoles = allRoles.filter((role) => !rolesArray.some((r) => r.name === role));

		if (availableRoles.length > 0) {
			const newRole: RoleWithPermissions = {
				name: availableRoles[0],
				isAdmin: false,
				permissions: Object.fromEntries(Object.values(PermissionAction).map((action) => [action, false]))
			};

			rolesArray = [...rolesArray, newRole];
			updateParent();
			showToast('Role added successfully', 'success');
		} else {
			showToast('All roles have been added', 'warning');
		}
	}

	// Function to update parent
	function updateParent() {
		const rolePermissions = {};
		rolesArray.forEach((role) => {
			rolePermissions[role.name] = role.permissions;
		});
		dispatch('update', rolePermissions);
	}

	// Show toast messages
	function showToast(message: string, type: 'success' | 'warning' | 'error') {
		const backgrounds = {
			success: 'variant-filled-success',
			warning: 'variant-filled-warning',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message,
			background: backgrounds[type],
			timeout: 3000
		});
	}

	// Initialize roles when they're provided
	$: if (roles.length > 0) {
		allRoles = roles.map((role) => role.name);
		rolesArray = roles.map((role) => ({
			name: role.name,
			isAdmin: role.isAdmin ?? false,
			permissions: convertPermissionsArray(role.permissions)
		}));
	}

	// Function to convert permissions array
	function convertPermissionsArray(permissionIds: string[] = []): Partial<Record<PermissionAction, boolean>> {
		return Object.values(PermissionAction).reduce(
			(acc, action) => {
				acc[action] = permissionIds.includes(action);
				return acc;
			},
			{} as Partial<Record<PermissionAction, boolean>>
		);
	}

	// Function to toggle permission
	function togglePermission(roleName: string, permission: PermissionAction): void {
		const role = rolesArray.find((r) => r.name === roleName);
		if (role && !role.isAdmin) {
			role.permissions[permission] = !role.permissions[permission];
			updateParent();
		} else if (role?.isAdmin) {
			showToast('Cannot modify permissions for admin role', 'warning');
		}
	}

	// Filter roles based on search
	$: filteredRolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
</script>

{#if error}
	<div class="p-4 text-center text-error-500" role="alert">
		<p>Error: {error}</p>
		<button on:click={() => (error = null)} class="variant-filled-primary btn mt-2"> Dismiss </button>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<h2 class="text-2xl font-bold">Manage Permissions</h2>
		<div class="flex flex-col justify-between gap-4 sm:flex-row">
			<input bind:value={searchQuery} placeholder="Search roles..." class="input flex-grow" aria-label="Search roles" />
			<button on:click={addRole} class="variant-filled-primary btn" disabled={allRoles.length === rolesArray.length}> Add Role </button>
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
