<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { authAdapter, initializationPromise } from '@api/databases/db';
	import type { Permission, Role } from '@src/auth/types';

	let permissionsList = writable<Permission[]>([]);
	let modifiedPermissions = writable<Set<string>>(new Set());
	let searchTerm = '';
	let selectedPermissions = writable<Set<string>>(new Set());
	let advancedConditions = writable<{ [key: string]: any }>({});
	let roles = writable<Role[]>([]);
	let isLoading = writable(true);
	let error = writable<string | null>(null);

	$: filteredPermissions = $permissionsList.filter((permission) => permission.contextId.toLowerCase().includes(searchTerm.toLowerCase()));

	onMount(async () => {
		try {
			await initializationPromise;
			await loadPermissions();
			await loadRoles();
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false);
		}
	});

	const loadPermissions = async () => {
		if (!authAdapter) {
			throw new Error('Auth adapter is not initialized');
		}
		try {
			const permissions = await authAdapter.getAllPermissions();
			permissionsList.set(permissions);
		} catch (err) {
			throw new Error(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const loadRoles = async () => {
		if (!authAdapter) {
			throw new Error('Auth adapter is not initialized');
		}
		try {
			const rolesData = await authAdapter.getAllRoles();
			roles.set(rolesData);
		} catch (err) {
			throw new Error(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const toggleRole = (permission: Permission, role: string) => {
		permissionsList.update((list) => {
			const perm = list.find((p) => p.permission_id === permission.permission_id);
			if (perm) {
				const currentRoles = perm.requiredRole.split(',').map((r) => r.trim());
				if (currentRoles.includes(role)) {
					perm.requiredRole = currentRoles.filter((r) => r !== role).join(',');
				} else {
					perm.requiredRole = [...currentRoles, role].join(',');
				}
				modifiedPermissions.update((set) => {
					set.add(permission.permission_id);
					return set;
				});
			}
			return list;
		});
	};

	const saveChanges = async () => {
		if (!authAdapter) {
			throw new Error('Auth adapter is not initialized');
		}
		const modified = Array.from($modifiedPermissions);
		try {
			for (const permissionId of modified) {
				const permission = $permissionsList.find((p) => p.permission_id === permissionId);
				if (permission) {
					await authAdapter.updatePermission(permission.permission_id, permission);
				}
			}
			modifiedPermissions.set(new Set());
			await loadPermissions();
		} catch (err) {
			throw new Error(`Failed to save changes: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const bulkDeletePermissions = async () => {
		if (!authAdapter) {
			throw new Error('Auth adapter is not initialized');
		}
		try {
			for (const permissionId of $selectedPermissions) {
				await authAdapter.deletePermission(permissionId);
			}
			selectedPermissions.set(new Set());
			await loadPermissions();
		} catch (err) {
			throw new Error(`Failed to delete permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const togglePermissionSelection = (permissionId: string) => {
		selectedPermissions.update((selected) => {
			if (selected.has(permissionId)) {
				selected.delete(permissionId);
			} else {
				selected.add(permissionId);
			}
			return selected;
		});
	};
</script>

{#if $isLoading}
	<p>Loading...</p>
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
										checked={permission.requiredRole
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
									bind:value={$advancedConditions[permission.permission_id]}
									class="rounded border border-gray-300 p-1"
								/>
							</td>
							<td class="px-4 py-2 text-center">
								<input
									type="checkbox"
									checked={$selectedPermissions.has(permission.permission_id)}
									on:change={() => togglePermissionSelection(permission.permission_id)}
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
