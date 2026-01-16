<!--
@file src/routes/(app)/config/assessManagement/Permissions.svelte
@component
**This component manages permissions in the access management system. It provides functionality to display existing permissions, search and filter permissions, modify permission settings, bulk delete selected permissions, and handle advanced permission conditions.**

@example
<Permissions />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

It provides the following functionality:
- Display existing permissions
- Search and filter permissions
- Modify permission settings, including role assignments
- Bulk delete selected permissions
- Handle advanced permission conditions
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';

	// Auth
	import type { Permission, Role } from '@src/databases/auth/types';
	import { PermissionType } from '@src/databases/auth/types';

	interface Props {
		// Props passed from +page.svelte
		roleData: any;
		setRoleData: any;
		updateModifiedCount: any;
	}

	const { roleData, setRoleData, updateModifiedCount }: Props = $props();

	// Reactive state
	let permissionsList: Permission[] = $state([]);
	let roles: Role[] = $state([]);
	const error = $state(null);
	let searchTerm = $state('');
	const modifiedPermissions = $state(new Set());

	// Sorting state
	type SortKey = 'name' | 'action' | 'type';
	let sortBy = $state('name');
	let sortOrder = $state(0);

	// Function to get groups of permissions
	const getGroups = (filteredPermissions: Permission[]) => {
		const groups: string[] = [];
		filteredPermissions.forEach((cur) => {
			let group = '';
			if (cur.type === PermissionType.COLLECTION) {
				group = 'Collection Entries';
			} else if (cur.type === PermissionType.USER) {
				group = 'User Management';
			} else if (cur.type === PermissionType.CONFIGURATION) {
				group = 'Configuration';
			} else if (cur.type === PermissionType.SYSTEM) {
				// Group system permissions by their prefix
				const prefix = cur._id.split(':')[0];
				if (prefix === 'system') {
					group = 'System';
				} else if (prefix === 'api') {
					group = 'API Access';
				} else if (prefix === 'content') {
					group = 'Content Management';
				} else if (prefix === 'config') {
					group = 'Configuration';
				} else if (prefix === 'admin') {
					group = 'Admin';
				} else {
					group = 'System';
				}
			}
			if (group && !groups.includes(group)) {
				groups.push(group);
			}
		});
		return groups;
	};

	// Handle column header click for sorting
	const handleSort = (column: SortKey) => {
		if (sortBy === column) {
			// Cycle through: ascending (1) -> descending (-1) -> unsorted (0)
			sortOrder = sortOrder === 1 ? -1 : sortOrder === -1 ? 0 : 1;
			if (sortOrder === 0) sortBy = 'name'; // Reset to default when unsorted
		} else {
			sortBy = column;
			sortOrder = 1; // Start with ascending
		}
	};

	// Sort permissions based on current sort settings
	const sortPermissions = (permissions: Permission[]): Permission[] => {
		if (sortOrder === 0) return permissions;

		return [...permissions].sort((a, b) => {
			let aVal: string | number = '';
			let bVal: string | number = '';

			if (sortBy === 'name') {
				aVal = a.name.toLowerCase();
				bVal = b.name.toLowerCase();
			} else if (sortBy === 'action') {
				aVal = a.action.toLowerCase();
				bVal = b.action.toLowerCase();
			} else if (sortBy === 'type') {
				aVal = a.type.toLowerCase();
				bVal = b.type.toLowerCase();
			}

			if (aVal < bVal) return sortOrder === 1 ? -1 : 1;
			if (aVal > bVal) return sortOrder === 1 ? 1 : -1;
			return 0;
		});
	};

	// Derived reactive values
	const filteredPermissions = $derived(
		permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
	);
	const groups = $derived(getGroups(filteredPermissions));
	const adminRole = $derived(roles.find((role) => role.isAdmin));
	const nonAdminRolesCount = $derived(roles.filter((role) => !role.isAdmin).length);

	// Initialize data when component mounts (run once)
	$effect(() => {
		// Only initialize if data hasn't been loaded yet
		if (permissionsList.length === 0 && page.data.permissions.length > 0) {
			roles = roleData;
			permissionsList = page.data.permissions;
		}
	});

	// Function to filter permissions by group (with sorting applied)
	const filterGroups = (permissions: Permission[], group: string): Permission[] => {
		let filtered: Permission[] = [];

		if (group === 'Collection Entries') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.COLLECTION);
		} else if (group === 'User Management') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.USER);
		} else if (group === 'Configuration') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.CONFIGURATION || (cur.type === PermissionType.SYSTEM && cur._id.startsWith('config:'))
			);
		} else if (group === 'System') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('system:'));
		} else if (group === 'API Access') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('api:'));
		} else if (group === 'Content Management') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('content:'));
		} else if (group === 'Admin') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('admin:'));
		} else {
			filtered = permissions.filter((cur) => cur._id.split(':')[0] === group.toLowerCase());
		}

		// Apply sorting to the filtered group
		return sortPermissions(filtered);
	};

	// Toggle role assignment for a permission
	const toggleRole = (permission: string, roleId: string) => {
		const updatedRoles = roles.map((role) => {
			if (role._id === roleId) {
				const permissions = [...role.permissions];
				const pIndex = permissions.findIndex((cur) => cur === permission);
				if (pIndex === -1) {
					permissions.push(permission);
				} else {
					permissions.splice(pIndex, 1);
				}
				return { ...role, permissions };
			}
			return role;
		});

		// Track modified permissions
		modifiedPermissions.add(permission);

		// Update role data and notify parent component
		roles = updatedRoles;
		setRoleData(updatedRoles);
		updateModifiedCount(modifiedPermissions.size);
	};
</script>

{#if error}
	<p class="error">{error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Permission Management:</h3>
	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Select the roles for each permission and click 'Save' to apply your changes.
	</p>

	<div class="sticky top-0 z-10 mb-4 flex items-center justify-between">
		<input type="text" bind:value={searchTerm} placeholder="Search Permissions..." class="input mr-4 grow" aria-label="Search permissions" />
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
						<th
							class="cursor-pointer select-none py-2 {sortBy === 'name' ? 'font-semibold text-primary-500 dark:text-secondary-400' : ''}"
							onclick={() => handleSort('name')}
							title="Click to sort by permission name"
						>
							<div class="flex items-center justify-center">
								Type
								{#if sortBy === 'name' && sortOrder !== 0}
									<iconify-icon
										icon={sortOrder === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded'}
										width="16"
										class="ml-1"
									></iconify-icon>
								{/if}
							</div>
						</th>
						<th
							class="cursor-pointer select-none py-2 {sortBy === 'action' ? 'font-semibold text-primary-500 dark:text-secondary-400' : ''}"
							onclick={() => handleSort('action')}
							title="Click to sort by action"
						>
							<div class="flex items-center justify-center">
								Action
								{#if sortBy === 'action' && sortOrder !== 0}
									<iconify-icon
										icon={sortOrder === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded'}
										width="16"
										class="ml-1"
									></iconify-icon>
								{/if}
							</div>
						</th>

						<!-- List only non-admin roles -->
						{#each roles as role}
							{#if !role.isAdmin}
								<th class="py-2">{role.name}</th>
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
									{#each roles as role}
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
{/if}

<style>
	.permission {
		height: calc(100vh - 400px);
	}
</style>
