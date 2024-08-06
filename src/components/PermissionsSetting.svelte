<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { icon, permissionActions, type PermissionAction } from '@src/auth/types';
	import { authAdapter, initializationPromise } from '@src/databases/db';

	import Loading from '@components/Loading.svelte';

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';

	const dispatch = createEventDispatcher();
	const toastStore = getToastStore();

	// Define the type for a role with permissions
	interface RoleWithPermissions {
		name: string;
		permissions: { [key in PermissionAction]?: boolean };
	}

	// Permissions are assumed to be passed in or fetched dynamically
	export let permissions: { [key: string]: { [key in PermissionAction]?: boolean } } = {};

	// Initialize rolesArray dynamically based on provided permissions
	let rolesArray: RoleWithPermissions[] = [];
	let allRoles: string[] = [];
	let isLoading = true;

	onMount(async () => {
		try {
			// Wait for the initialization promise to resolve
			await initializationPromise;

			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}

			const fetchedRoles = await authAdapter.getAllRoles();
			allRoles = fetchedRoles.map((role) => role.name);
			updateRolesArray();
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

	$: updateRolesArray = () => {
		rolesArray = Object.entries(permissions).map(([role, perms]) => ({
			name: role,
			permissions: perms || Object.fromEntries(permissionActions.map((action) => [action, false]))
		}));
	};

	// Toggle specific permission for a role
	function togglePermission(roleName: string, permission: PermissionAction) {
		const role = rolesArray.find((r) => r.name === roleName);
		if (role && role.permissions[permission] !== undefined) {
			role.permissions[permission] = !role.permissions[permission];
			dispatch('update', { [roleName]: role.permissions });
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
		const availableRoles = allRoles.filter((r) => !existingRoles.includes(r));
		if (availableRoles.length > 0) {
			const newRole = {
				name: availableRoles[0],
				permissions: Object.fromEntries(permissionActions.map((action) => [action, false]))
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

	let searchQuery = '';
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
					{#each permissionActions as permission}
						<th>{permission}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each filteredRolesArray as role}
					<tr>
						<td>{role.name}</td>
						{#each permissionActions as permission}
							<td>
								<button
									on:click={() => togglePermission(role.name, permission)}
									class={`btn ${role.permissions[permission] ? 'variant-filled-success' : 'variant-filled-error'}`}
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
