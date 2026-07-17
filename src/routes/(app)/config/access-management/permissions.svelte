<!--
@file src/routes/(app)/config/access-management/permissions.svelte
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
// Auth
import type { Permission, Role } from "@src/databases/auth/types";
import { PermissionType } from "@src/databases/auth/permission-constants";
// Stores
import { page } from "$app/state";

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
let searchTerm = $state("");
const modifiedPermissions = $state(new Set());

// Sorting state
type SortKey = "name" | "action" | "type";
let sortBy = $state("name");
let sortOrder = $state(0);

// Function to get groups of permissions
const getGroups = (filteredPermissions: Permission[]) => {
	const groups: string[] = [];
	filteredPermissions.forEach((cur) => {
		let group = "";
		if (cur.type === PermissionType.COLLECTION) {
			group = "Collection Entries";
		} else if (cur.type === PermissionType.USER) {
			group = "User Management";
		} else if (cur.type === PermissionType.CONFIGURATION) {
			group = "Configuration";
		} else if (cur.type === PermissionType.SYSTEM) {
			// Group system permissions by their prefix
			const prefix = cur._id.split(":")[0];
			if (prefix === "system") {
				group = "System";
			} else if (prefix === "api") {
				group = "API Access";
			} else if (prefix === "content") {
				group = "Content Management";
			} else if (prefix === "media") {
				group = "Media Management";
			} else if (prefix === "config") {
				group = "Configuration";
			} else if (prefix === "admin") {
				group = "Admin";
			} else {
				group = "System";
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
		if (sortOrder === 0) {
			sortBy = "name"; // Reset to default when unsorted
		}
	} else {
		sortBy = column;
		sortOrder = 1; // Start with ascending
	}
};

// Sort permissions based on current sort settings
const sortPermissions = (permissions: Permission[]): Permission[] => {
	if (sortOrder === 0) {
		return permissions;
	}

	return [...permissions].sort((a, b) => {
		let aVal: string | number = "";
		let bVal: string | number = "";

		if (sortBy === "name") {
			aVal = a.name.toLowerCase();
			bVal = b.name.toLowerCase();
		} else if (sortBy === "action") {
			aVal = a.action.toLowerCase();
			bVal = b.action.toLowerCase();
		} else if (sortBy === "type") {
			aVal = a.type.toLowerCase();
			bVal = b.type.toLowerCase();
		}

		if (aVal < bVal) {
			return sortOrder === 1 ? -1 : 1;
		}
		if (aVal > bVal) {
			return sortOrder === 1 ? 1 : -1;
		}
		return 0;
	});
};

// Derived reactive values
const filteredPermissions = $derived(
	permissionsList.filter(
		(permission) =>
			permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false,
	),
);
const groups = $derived(getGroups(filteredPermissions));
const adminRole = $derived(roles.find((role) => role.isAdmin));
const nonAdminRolesCount = $derived(
	roles.filter((role) => !role.isAdmin).length,
);

// Initialize data when component mounts (run once)
$effect(() => {
	// Only initialize if data hasn't been loaded yet
	if (permissionsList.length === 0 && page.data.permissions.length > 0) {
		roles = roleData;
		permissionsList = page.data.permissions;
	}
});

// Compute checkbox state (checked, indeterminate) for a role's header checkbox.
// Uses String() normalization to handle potential mixed ID types across DB adapters.
const getHeaderCheckboxState = (role: Role): { checked: boolean; indeterminate: boolean } => {
	if (filteredPermissions.length === 0) {
		return { checked: false, indeterminate: false };
	}
	const rolePermIds = new Set(role.permissions.map(String));
	const allChecked = filteredPermissions.every((p) => rolePermIds.has(String(p._id)));
	const someChecked = filteredPermissions.some((p) => rolePermIds.has(String(p._id)));
	return { checked: allChecked, indeterminate: someChecked && !allChecked };
};

// Function to filter permissions by group (with sorting applied)
const filterGroups = (
	permissions: Permission[],
	group: string,
): Permission[] => {
	let filtered: Permission[] = [];

	if (group === "Collection Entries") {
		filtered = permissions.filter(
			(cur) => cur.type === PermissionType.COLLECTION,
		);
	} else if (group === "User Management") {
		filtered = permissions.filter((cur) => cur.type === PermissionType.USER);
	} else if (group === "Configuration") {
		filtered = permissions.filter(
			(cur) =>
				cur.type === PermissionType.CONFIGURATION ||
				(cur.type === PermissionType.SYSTEM && cur._id.startsWith("config:")),
		);
	} else if (group === "System") {
		filtered = permissions.filter(
			(cur) =>
				cur.type === PermissionType.SYSTEM && cur._id.startsWith("system:"),
		);
	} else if (group === "API Access") {
		filtered = permissions.filter(
			(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith("api:"),
		);
	} else if (group === "Content Management") {
		filtered = permissions.filter(
			(cur) =>
				cur.type === PermissionType.SYSTEM && cur._id.startsWith("content:"),
		);
	} else if (group === "Media Management") {
		filtered = permissions.filter(
			(cur) =>
				cur.type === PermissionType.SYSTEM && cur._id.startsWith("media:"),
		);
	} else if (group === "Admin") {
		filtered = permissions.filter(
			(cur) =>
				cur.type === PermissionType.SYSTEM && cur._id.startsWith("admin:"),
		);
	} else {
		filtered = permissions.filter(
			(cur) => cur._id.split(":")[0] === group.toLowerCase(),
		);
	}

	// Apply sorting to the filtered group
	return sortPermissions(filtered);
};

// Toggle role assignment for a permission
const toggleRole = (permission: string, roleId: string) => {
	const updatedRoles = roles.map((role) => {
		if (role._id === roleId) {
			const permissions = [...role.permissions];
			const pIndex = permissions.findIndex((p) => String(p) === String(permission));
			if (pIndex === -1) {
				permissions.push(permission);
			} else {
				permissions.splice(pIndex, 1);
			}
			return { ...role, permissions };
		}
		return role;
	});

	modifiedPermissions.add(String(permission));
	roles = updatedRoles;
	setRoleData(updatedRoles);
	updateModifiedCount(modifiedPermissions.size);
};

// Bulk toggle for a role
const toggleAllForRole = (roleId: string, checked: boolean) => {
	// Guard: nothing to toggle when there are no filtered permissions
	if (filteredPermissions.length === 0) return;

	const updatedRoles = roles.map((role) => {
		if (role._id === roleId) {
			if (checked) {
				// Add all filtered permissions (String-normalized for type-safe deduplication)
				const newPerms = new Set([
					...role.permissions.map(String),
					...filteredPermissions.map((p) => String(p._id)),
				]);
				return { ...role, permissions: Array.from(newPerms) };
			} else {
				// Remove all filtered permissions (String-normalized for consistent hashing)
				const filteredIds = new Set(filteredPermissions.map((p) => String(p._id)));
				return {
					...role,
					permissions: role.permissions.filter((p) => !filteredIds.has(String(p))),
				};
			}
		}
		return role;
	});

	filteredPermissions.forEach((p) => modifiedPermissions.add(p._id));
	roles = updatedRoles;
	setRoleData(updatedRoles);
	updateModifiedCount(modifiedPermissions.size);
};

function getActionBadgeClass(action: string) {
	switch (action.toLowerCase()) {
		case 'read':
			return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
		case 'create':
		case 'write':
			return 'bg-success-500/15 text-tertiary-600 dark:text-primary-600 dark:text-primary-500';
		case 'delete':
			return 'bg-error-500/15 text-error-600 dark:text-error-500';
		case 'manage':
			return 'bg-tertiary-500/15 text-tertiary-600 dark:text-tertiary-400';
		default:
			return 'bg-surface-500/15 text-surface-600 dark:text-surface-400';
	}
}
</script>

{#if error}
	<p class="error">{error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold text-surface-900 dark:text-surface-50">Permission Management</h3>
	<p class="mb-6 text-center text-sm text-surface-500 dark:text-surface-400">
		Select the roles for each permission and click 'Save' to apply your changes.
	</p>

	<div class="sticky top-0 z-10 mb-6 flex items-center justify-between">
		<div class="relative w-full">
			<div class="absolute inset-y-0 inset-s-0 ps-3.5 flex items-center pointer-events-none text-surface-400">
				<iconify-icon icon="material-symbols:search-rounded" width="20"></iconify-icon>
			</div>
			<input aria-label="Search permissions"
				type="text"
				bind:value={searchTerm}
				placeholder="Search Permissions..."
				class="w-full ps-11 pe-4 py-2.5 rounded border border-surface-200  bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-hidden focus:ring-2 focus:ring-primary-500/20 focus:border-tertiary-500 dark:border-primary-500 placeholder-surface-400 dark:placeholder-surface-500 transition-all text-sm shadow-xs"
				/>
		</div>
	</div>

	{#if filteredPermissions.length === 0}
		<div class="text-center py-8 border border-dashed border-surface-200 dark:border-surface-800 rounded bg-surface-50 dark:bg-surface-900">
			<iconify-icon icon="material-symbols:search-off-rounded" width="32" class="text-surface-400 mb-2"></iconify-icon>
			<p class="text-surface-500 dark:text-surface-400 text-sm">{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}</p>
		</div>
	{:else}
		<!-- Admin Notice -->
		{#if adminRole}
			<div class="mb-4 flex items-center justify-center gap-1.5 text-xs text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-900/30 border border-surface-200/60 dark:border-surface-800/55 py-2 px-4 rounded w-max mx-auto shadow-xs">
				<span class="font-extrabold text-error-500">*</span>
				<span><span class="font-semibold text-tertiary-600 dark:text-primary-600">{adminRole.name}</span> Role has all permissions by default.</span>
			</div>
		{/if}
		<div class="permission overflow-x-auto rounded border border-surface-200 dark:border-surface-800/80 shadow-sm bg-white dark:bg-surface-900">
			<table class="w-full text-start border-collapse table-auto">
				<!-- Header -->
				<thead class="bg-surface-50 dark:bg-surface-950 border-b border-surface-200 dark:border-surface-800/80">
					<tr>
						<th class="px-5 py-4 font-semibold text-surface-700 dark:text-surface-300 w-2/5" aria-sort={sortBy === 'name' ? (sortOrder === 1 ? 'ascending' : 'descending') : 'none'}>
							<button
								class="flex items-center gap-1 font-semibold text-xs tracking-wider uppercase text-surface-600 hover:text-tertiary-500  dark:hover:text-tertiary-500 dark:text-primary-600 transition-colors"
								onclick={() => handleSort('name')}
								title="Click to sort by permission name"
								aria-label="Sort by permission name"
							>
								Permission Name
								{#if sortBy === 'name' && sortOrder !== 0}
									<iconify-icon
										icon={sortOrder === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded'}
										width="14"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
								{/if}
							</button>
						</th>
						<th class="px-5 py-4 font-semibold text-center w-1/5" aria-sort={sortBy === 'action' ? (sortOrder === 1 ? 'ascending' : 'descending') : 'none'}>
							<button
								class="inline-flex items-center gap-1 font-semibold text-xs tracking-wider uppercase text-surface-600 hover:text-tertiary-500 dark:text-primary-600 dark:hover:text-tertiary-500 transition-colors mx-auto"
								onclick={() => handleSort('action')}
								title="Click to sort by action"
								aria-label="Sort by action"
							>
								Action
								{#if sortBy === 'action' && sortOrder !== 0}
									<iconify-icon
										icon={sortOrder === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded'}
										width="14"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
								{/if}
							</button>
						</th>

						<!-- List only non-admin roles -->
						{#each roles as role (role._id)}
							{#if !role.isAdmin}
								{@const headerState = getHeaderCheckboxState(role)}
								<th class="px-5 py-4 dark:text-surface-50 text-center" scope="col">
									<div class="flex flex-col items-center gap-1.5">
										<span class="text-xs font-semibold tracking-wider uppercase text-surface-600 dark:text-surface-400">{role.name}</span>
										<div class="flex items-center gap-1.5 mt-0.5">
											<input aria-label="Select all permissions"
												type="checkbox"
												class="h-4 w-4 rounded-sm border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 text-tertiary-500 dark:text-primary-500 focus:ring-primary-500/20 focus:ring-2 cursor-pointer transition-all"
												checked={headerState.checked}
												indeterminate={headerState.indeterminate}
												onchange={(e) => toggleAllForRole(role._id, e.currentTarget.checked)}
												title={`Select/Deselect all filtered permissions for ${role.name}`}
											/>
											<button
												class="flex items-center justify-center p-0.5 rounded-sm border border-surface-200 dark:border-surface-700/60 hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 hover:text-tertiary-500 dark:hover:text-tertiary-500 dark:text-primary-600 transition-colors"
												onclick={() => toggleAllForRole(role._id, true)}
												title="Assign role to all filtered permissions"
												aria-label={`Assign ${role.name} to all filtered permissions`}
											>
												<iconify-icon icon="mdi:check-all" width="12"></iconify-icon>
											</button>
										</div>
									</div>
								</th>
							{/if}
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
					<!-- Permission Groups -->
					{#each groups as group (group)}
						{#if filterGroups(filteredPermissions, group).length > 0}
							<!-- Group Name -->
							<tr class="bg-surface-50/70 dark:bg-surface-900/40">
								<td
									colspan={nonAdminRolesCount + 2}
									class="px-5 py-2.5 font-bold text-xs tracking-wider uppercase text-surface-500 dark:text-surface-400 border-y border-surface-200/60 dark:border-surface-800/60"
								>
									{group}
								</td>
							</tr>
							<!-- Permissions within the Group -->
							{#each filterGroups(filteredPermissions, group) as permission (permission._id)}
								<tr class="hover:bg-surface-50/40 dark:hover:bg-surface-850/40 transition-colors">
									<!-- Type -->
									<td class="px-5 py-3 text-sm text-surface-700 dark:text-surface-300 font-medium">{permission.name}</td>
									<!-- Action -->
									<td class="px-5 py-3 text-center">
										<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider {getActionBadgeClass(permission.action)}">
											{permission.action}
										</span>
									</td>
									<!-- Roles -->
									{#each roles as role (role._id)}
										{#if !role.isAdmin}
											<td class="px-5 py-3 text-center">
												<input aria-label="Search users"
													type="checkbox"
													checked={role.permissions.some((p) => String(p) === String(permission._id))}
													onchange={() => toggleRole(permission._id, role._id)}
													class="h-4 w-4 rounded-sm border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 text-tertiary-500 dark:text-primary-500 focus:ring-primary-500/20 focus:ring-2 cursor-pointer transition-all mx-auto"
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
	/* No fixed height, let parent page container handle vertical scrolling */
</style>
