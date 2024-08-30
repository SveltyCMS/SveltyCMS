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
	const selectedPermissions = writable<Set<string>>(new Set());
	const advancedConditions = writable<{ [key: string]: any }>({});
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	// Reactive statements for filtered permissions and current user ID
	$: filteredPermissions = $permissionsList.filter((permission) => permission.contextId?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
	$: currentUserId = $page.data.user?._id || '';

	// Load data on component mount
	onMount(async () => {
		try {
			await initializationPromise;
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}
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
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}
			const permissions = await authAdapter.getAllPermissions();
			permissionsList.set(permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Function to load roles
	const loadRoles = async () => {
		try {
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}
			const rolesData = await authAdapter.getAllRoles();
			roles.set(rolesData);
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

	// Bulk delete selected permissions
	const bulkDeletePermissions = async () => {
		try {
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}
			for (const permissionName of $selectedPermissions) {
				await authAdapter.deletePermission(permissionName, currentUserId);
			}
			selectedPermissions.set(new Set());
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to delete permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Toggle permission selection
	const togglePermissionSelection = (permissionName: string) => {
		selectedPermissions.update((selected) => {
			if (selected.has(permissionName)) {
				selected.delete(permissionName);
			} else {
				selected.add(permissionName);
			}
			return selected;
		});
	};
</script>

{#if $isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="Please wait while permissions are being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="card mt-8 p-4">
		<h3 class="mb-4 text-lg font-semibold">Existing Permissions</h3>
		<div class="mb-4">
			<input
				type="text"
				bind:value={searchTerm}
				placeholder="Search permissions..."
				class="w-full rounded border border-gray-300 p-2"
				aria-label="Search permissions"
			/>
		</div>
		{#if filteredPermissions.length === 0}
			<p class="text-tertiary-500 dark:text-primary-500">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		{:else}
			<table class="compact w-full table-auto border-collapse border border-gray-200">
				<thead class="bg-gray-50">
					<tr class="divide-x">
						<th class="px-4 py-2">Permission ID</th>
						<th class="px-4 py-2">Action</th>
						<th class="px-4 py-2">Type</th>
						{#each $roles as role}
							<th class="px-4 py-2">{role.name}</th>
						{/each}
						<th class="px-4 py-2">Advanced Conditions</th>
						<th class="px-4 py-2">Select</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredPermissions as permission}
						<tr class="divide-x">
							<td class="px-4 py-2">{permission.contextId}</td>
							<td class="px-4 py-2">{permission.action}</td>
							<td class="px-4 py-2">{permission.contextType}</td>
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
							<td class="px-4 py-2 text-center">
								<input
									type="text"
									placeholder="Conditions"
									bind:value={$advancedConditions[permission.name]}
									class="rounded border border-gray-300 p-1"
								/>
							</td>
							<td class="px-4 py-2 text-center">
								<input
									type="checkbox"
									checked={$selectedPermissions.has(permission.name)}
									on:change={() => togglePermissionSelection(permission.name)}
									class="form-checkbox"
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if $modifiedPermissions.size > 0}
			<div class="mt-4 text-right">
				<button on:click={saveChanges} class="rounded bg-blue-500 px-4 py-2 text-white">
					Save Changes ({$modifiedPermissions.size})
				</button>
			</div>
		{/if}

		<div class="mt-4 text-right">
			<button on:click={bulkDeletePermissions} class="rounded bg-red-500 px-4 py-2 text-white"> Delete Selected Permissions </button>
		</div>
	</div>
{/if}
