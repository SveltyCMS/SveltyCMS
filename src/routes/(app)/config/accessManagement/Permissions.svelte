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
	import type { Permission, Role } from '@src/auth/types';
	import { PermissionType } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';

	interface Props {
		// Props passed from +page.svelte
		roleData: any;
		setRoleData: any;
		updateModifiedCount: any;
	}

	let { roleData, setRoleData, updateModifiedCount }: Props = $props();

	// Reactive state
	let permissionsList = $state<Permission[]>([]);
	let roles = $state<Role[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchTerm = $state('');
	let modifiedPermissions = $state(new Set<string>());

	// Derived reactive values
	let filteredPermissions = $derived(
		permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
	);
	let groups = $derived(getGroups(filteredPermissions));
	let adminRole = $derived(roles.find((role) => role.isAdmin));
	let nonAdminRolesCount = $derived(roles.filter((role) => !role.isAdmin).length);

	// Initialize data when component mounts
	$effect(() => {
		loadData();
	});

	// Load initial data
	const loadData = async () => {
		try {
			roles = roleData;
			permissionsList = page.data.permissions;
		} catch (err) {
			error = `Failed to initialize: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isLoading = false;
		}
	};

	// Function to get groups of permissions
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

	// Function to filter permissions by group
	const filterGroups = (permissions: Permission[], group: string): Permission[] => {
		if (group === 'User Management') {
			return permissions.filter((cur) => cur.type === PermissionType.USER);
		} else if (group === 'Configuration') {
			return permissions.filter(
				(cur) => cur.type === PermissionType.CONFIGURATION || (cur.type === PermissionType.SYSTEM && cur._id.startsWith('config:'))
			);
		} else if (group === 'System') {
			return permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('system:'));
		} else if (group === 'API Access') {
			return permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('api:'));
		} else if (group === 'Content Management') {
			return permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('content:'));
		} else if (group === 'Admin') {
			return permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('admin:'));
		} else {
			return permissions.filter((cur) => cur._id.split(':')[0] === group.toLowerCase());
		}
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

{#if isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="" />
{:else if error}
	<p class="error">{error}</p>
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
							{#each roles as role}
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
	</div>
{/if}

<style lang="postcss">
	.permission {
		height: calc(100vh - 400px);
	}
</style>
