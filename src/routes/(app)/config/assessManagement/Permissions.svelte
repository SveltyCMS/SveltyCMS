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
	import type { Permission, Role } from '@src/auth/types';
	import { PermissionType } from '@root/config/permissions';

	// Components
	import Loading from '@components/Loading.svelte';

	//Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Define writable stores
	let searchTerm = '';
	const permissionsList = writable<Permission[]>([]);
	const modifiedPermissions = writable<Set<string>>(new Set());
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	const getGroups = (filteredPermissions: Permission[]) => {
		const groups: string[] = [];
		filteredPermissions.forEach((cur) => {
			let group = '';
			if (cur.type === PermissionType.COLLECTION) {
				group = cur._id.split(':')[0];
			} else if (cur.type === PermissionType.USER) {
				group = 'User Management';
			} else if (cur.type === PermissionType.CONFIGURATION) {
				group = 'Configuration';
			}
			if (!groups.includes(group)) {
				groups.push(group);
			}
		});
		return groups;
	};

	const filterGroups = (permissions, group) => {
		if (group === 'User Management') {
			return permissions.filter((cur) => cur.type === PermissionType.USER);
		} else if (group === 'Configuration') {
			return permissions.filter((cur) => cur.type === PermissionType.CONFIGURATION);
		} else {
			return permissions.filter((cur) => cur._id.split(':')[0] === group);
		}
	};

	// Load data on component mount
	onMount(async () => {
		try {
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
			permissionsList.set($page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Function to load roles
	const loadRoles = async () => {
		try {
			roles.set($page.data.roles);
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Toggle role assignment for a permission
	const toggleRole = (permission: string, role: string) => {
		roles.update((list) => {
			const index = list.findIndex((cur) => cur._id === role);
			const permissions = list[index].permissions;
			const pIndex = permissions.findIndex((cur) => cur === permission);
			if (pIndex === -1) {
				permissions.push(permission);
			} else {
				permissions.splice(pIndex, 1);
			}
			list.splice(index, 1, { ...list[index], permissions });
			modifiedPermissions.update((per) => {
				per.add(permission);
				return per;
			});
			return list;
		});
	};

	// Save changes to permissions
	const saveChanges = async () => {
		try {
			try {
				const response = await fetch('/api/permission/update', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ roles: $roles })
				});

				if (response.status === 200) {
					showToast('Config file updated successfully', 'success');
				} else if (response.status === 304) {
					// Provide a custom message for 304 status
					showToast('No changes detected, config file not updated', 'info');
				} else {
					const responseText = await response.text();
					showToast(`Error updating config file: ${responseText}`, 'error');
				}

				isLoading.set(true);
				modifiedPermissions.set(new Set());
			} catch (error) {
				showToast('Network error occurred while updating config file', 'error');
			}
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to save changes: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Show corresponding Toast messages
	function showToast(message, type) {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}

	// Reset changes to permissions
	const resetChanges = () => {
		modifiedPermissions.set(new Set());
	};

	// Reactive statements for filtered permissions and current user ID
	$: filteredPermissions = $permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
	$: groups = getGroups(filteredPermissions);

	// Reactive statements and variables
	$: adminRole = $roles.find((role) => role.isAdmin);
	$: nonAdminRolesCount = $roles.filter((role) => !role.isAdmin).length;
</script>

{#if $isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="" />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<h3 class="text-center text-xl font-bold lg:text-left">Permission Management:</h3>
	<p class="text-center text-sm text-gray-500 dark:text-gray-400">
		Manage permissions and assign roles to users. You can create, edit, or delete permissions and assign roles to them.
	</p>
	<div class="wrapper">
		<div class="sticky top-0 z-10 mb-4 flex items-center justify-between">
			<input type="text" bind:value={searchTerm} placeholder="Search Permissions..." class="input mr-4 flex-grow" aria-label="Search permissions" />
			<div class="flex space-x-2">
				{#if $modifiedPermissions.size > 0}
					<button on:click={saveChanges} class="variant-filled-tertiary btn">
						Save Changes ({$modifiedPermissions.size})
					</button>
					<button on:click={resetChanges} class="variant-filled-secondary btn">Reset</button>
				{/if}
			</div>
		</div>

		{#if filteredPermissions.length === 0}
			<p class="text-tertiary-500 dark:text-primary-500">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		{:else}
			<!-- Admin Notice -->
			{#if adminRole}
				<p class="text-center">
					*
					<span class="text-tertiary-500 dark:text-primary-500">{adminRole.name}</span>
					Role has all permissions
				</p>
			{/if}
			<div class="permission overflow-auto">
				<table class="compact w-full table-auto border-separate rounded border border-surface-200">
					<!-- Header -->
					<thead class="sticky top-0 border border-b border-surface-200">
						<tr class="divide-x border-b text-tertiary-500 dark:text-primary-500">
							<th class="px-4 py-2">Type</th>
							<th class="px-4 py-2">Action</th>

							<!-- List only non-admin roles -->
							{#each $roles as role}
								{#if !role.isAdmin}
									<th class="px-4 py-2 text-center">{role.name}</th>
								{/if}
							{/each}
						</tr>
					</thead>
					<tbody>
						<!-- Permission Groups -->
						{#each groups as group}
							<tr>
								<td
									colSpan={nonAdminRolesCount + 2}
									class="bg-gray-800 px-4 py-2 text-center font-semibold text-tertiary-500 text-white dark:text-primary-500 lg:text-left">{group}</td
								>
							</tr>
							{#each filterGroups(filteredPermissions, group) as permission}
								<tr class="divide-x border-b">
									<td class="px-4 py-2">{permission._id}</td>
									<td class="px-4 py-2 text-center">{permission.action}</td>

									{#each $roles as role}
										{#if !role.isAdmin}
											<td class="px-4 py-2 text-center">
												<input
													type="checkbox"
													checked={role.permissions.includes(permission._id)}
													on:change={() => toggleRole(permission._id, role._id)}
													class="form-checkbox"
												/>
											</td>
										{/if}
									{/each}
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}
