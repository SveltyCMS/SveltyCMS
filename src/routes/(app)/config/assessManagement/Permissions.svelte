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
	import { page } from '$app/state';
	import type { Permission, Role } from '@src/auth/types';
	import { PermissionType } from '@src/auth/permissionTypes';

	// Components
	import Loading from '@components/Loading.svelte';

	interface Props {
		// Props passed from +page.svelte
		roleData: any;
		setRoleData: any;
		updateModifiedCount: any;
	}

	let { roleData, setRoleData, updateModifiedCount }: Props = $props();

	const permissionsList = writable<Permission[]>([]);
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	let searchTerm = $state('');
	let modifiedPermissions = new Set<string>();

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
			permissionsList.set(page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Function to load roles
	const loadRoles = async () => {
		try {
			roles.set(roleData);
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

			// Track modified permissions
			modifiedPermissions.add(permission);

			// Update role data and notify parent component
			setRoleData(list);
			updateModifiedCount(modifiedPermissions.size); // Notify parent about the number of changes

			return list;
		});
	};

	// Reactive statements for filtered permissions and current user ID
	let filteredPermissions = $derived(
		$permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
	);
	let groups = $derived(getGroups(filteredPermissions));

	// Reactive statements and variables
	let adminRole = $derived($roles.find((role) => role.isAdmin));
	let nonAdminRolesCount = $derived($roles.filter((role) => !role.isAdmin).length);
</script>

{#if $isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="" />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Permission Management:</h3>
	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Select the roles for each permission and click 'Save' to apply your changes.
	</p>
	<div class="wrapper">
		<div class="sticky top-0 z-10 mb-4 flex items-center justify-between">
			<input type="text" bind:value={searchTerm} placeholder="Search Permissions..." class="input mr-4 flex-grow" aria-label="Search permissions" />
		</div>

		{#if filteredPermissions.length === 0}
			<p class="text-tertiary-500 dark:text-primary-500">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		{:else}
			<!-- Admin Notice -->
			{#if adminRole}
				<p class="mb-2 w-full overflow-auto text-nowrap text-center">
					*
					<span class="text-tertiary-500 dark:text-primary-500">{adminRole.name}</span>
					Role has all permissions
				</p>
			{/if}
			<div class="permission overflow-auto">
				<table class="compact w-full table-auto border">
					<!-- Header -->
					<thead class="sticky top-0 border bg-surface-800">
						<tr class="divide-x text-tertiary-500 dark:text-primary-500">
							<th class="py-2">Type</th>
							<th>Action</th>

							<!-- List only non-admin roles -->
							{#each $roles as role}
								{#if !role.isAdmin}
									<th>{role.name}</th>
								{/if}
							{/each}
						</tr>
					</thead>
					<tbody>
						<!-- Permission Groups -->
						{#each groups as group}
							{#if filterGroups(filteredPermissions, group).length > 0}
								<!-- Group Name -->
								<tr>
									<td
										colspan={nonAdminRolesCount + 2}
										class="border-b bg-surface-500 px-1 py-2 font-semibold text-tertiary-500 dark:text-primary-500 lg:text-left"
									>
										{group}:
									</td>
								</tr>
								<!-- Permissions within the Group -->
								{#each filterGroups(filteredPermissions, group) as permission}
									<tr class="divide-x border-b text-center hover:bg-surface-50 dark:hover:bg-surface-600">
										<!-- Type -->
										<td class="px-1 py-1 md:text-left">{permission.name}</td>
										<!-- Action -->
										<td class="px-1 py-1">{permission.action}</td>
										<!-- Roles -->
										{#each $roles as role}
											{#if !role.isAdmin}
												<td class="px-1 py-1">
													<input
														type="checkbox"
														checked={role.permissions.includes(permission._id)}
														onchange={() => toggleRole(permission._id, role._id)}
														class="form-checkbox"
													/>
												</td>
											{/if}
										{/each}
									</tr>
								{/each}
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style lang="postcss">
	.permission {
		height: calc(100vh - 400px);
	}
</style>
