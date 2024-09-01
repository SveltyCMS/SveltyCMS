<!--
@file src/routes/(app)/config/assessManagement/Permissions.svelte
@description This component manages permissions in the access management system. It provides functionality to:
- Display existing permissions
- Search and filter permissions
- Modify permission settings, including role assignments
- Bulk delete selected permissions
- Handle advanced permission conditions
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// Stores
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';

	// Auth
	import { authAdapter, initializationPromise } from '@src/databases/db';
	import type { Permission, Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';

	// Define writable stores
	const permissionsList = writable<Permission[]>([]);
	const modifiedPermissions = writable<Set<string>>(new Set());
	let searchTerm = '';
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	// Reactive statements for filtered permissions and current user ID
	$: filteredPermissions = $permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
	$: currentUserId = $page.data.user?._id || '';

	// Load data on component mount
	onMount(async () => {
		try {
			// await initializationPromise;
			// if (!authAdapter) {
			// 	throw new Error('Auth adapter is not initialized');
			// }
			await loadRoles();
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false);
		}
	});

	// Function to load permissions
	const loadPermissions = async () => {
		try {
			// if (!authAdapter) {
			// 	throw new Error('Auth adapter is not initialized');
			// }
			// const permissions = await authAdapter.getAllPermissions();
			// permissionsList.set(permissions);
			permissionsList.set($page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Function to load roles
	const loadRoles = async () => {
		try {
			// if (!authAdapter) {
			// 	throw new Error('Auth adapter is not initialized');
			// }
			// const rolesData = await authAdapter.getAllRoles();
			// roles.set(rolesData);
			roles.set($page.data.roles);
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Toggle role assignment for a permission
	const toggleRole = (permission: Permission, role: string) => {
		permissionsList.update((list) => {
			const perm = list.find((p) => p.name === permission.name);
			if (perm) {
				const currentRoles = perm.requiredRole?.split(',').map((r) => r.trim()) || [];
				if (currentRoles.includes(role)) {
					perm.requiredRole = currentRoles.filter((r) => r !== role).join(',');
				} else {
					perm.requiredRole = [...currentRoles, role].join(',');
				}
				modifiedPermissions.update((set) => {
					set.add(permission.name);
					return set;
				});
			}
			return list;
		});
	};

	// Save changes to permissions
	const saveChanges = async () => {
		try {
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}
			const modified = Array.from($modifiedPermissions);
			for (const permissionName of modified) {
				const permission = $permissionsList.find((p) => p.name === permissionName);
				if (permission) {
					await authAdapter.updatePermission(permission.name, permission, currentUserId);
				}
			}
			modifiedPermissions.set(new Set());
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to save changes: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Reset changes to permissions
	const resetChanges = () => {
		modifiedPermissions.set(new Set());
	};
</script>

{#if $isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="Please wait while permissions are being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="wrapper">
		<div class="sticky top-0 z-10 mb-4 flex items-center justify-between">
			<input type="text" bind:value={searchTerm} placeholder="Search permissions..." class="input mr-4 flex-grow" aria-label="Search permissions" />
			<div class="flex space-x-2">
				{#if $modifiedPermissions.size > 0}
					<button on:click={saveChanges} class="variant-filled-tertiary btn">
						Save Changes ({$modifiedPermissions.size})
					</button>
					<button on:click={resetChanges} class="variant-filled-secondary btn">Reset</button>
				{/if}
			</div>
		</div>
		<!-- TODO: Make Titke dynamic -->
		<h2 class="mb-4 text-lg font-semibold">Default Permissions:</h2>
		{#if filteredPermissions.length === 0}
			<p class="text-tertiary-500 dark:text-primary-500">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		{:else}
			<table class="compact w-full table-auto border-collapse border border-gray-200">
				<thead class="">
					<tr class="divide-x border-b text-tertiary-500 dark:text-primary-500">
						<th class="px-4 py-2">Type</th>
						<th class="px-4 py-2">Action</th>

						{#each $roles as role}
							<th class="px-4 py-2">{role.name}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each filteredPermissions as permission}
						<tr class="divide-x">
							<td class="px-4 py-2">{permission._id}</td>
							<td class="px-4 py-2">{permission.action}</td>

							{#each $roles as role}
								<td class="px-4 py-2 text-center">
									<input
										type="checkbox"
										checked={(permission.requiredRole ?? '')
											.split(',')
											.map((r) => r.trim())
											.includes(role.name)}
										on:change={() => toggleRole(permission, role.name)}
										class="form-checkbox"
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
{/if}
