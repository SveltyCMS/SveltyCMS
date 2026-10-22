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
	import type { Permission, Role } from '@src/databases/auth/types';
	import { PermissionType } from '@src/databases/auth/permission-constants';
	// Components
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table';
	import {
		access_permissions_action,
		access_permissions_assign_all_title,
		access_permissions_name,
		access_permissions_search_aria,
		access_permissions_search_placeholder,
		access_permissions_sort_action_aria,
		access_permissions_sort_action_title,
		access_permissions_sort_name_aria,
		access_permissions_sort_name_title
	} from '@src/paraglide/messages';
	// Stores
	import { page } from '$app/state';

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
				} else if (prefix === 'media') {
					group = 'Media Management';
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
			if (sortOrder === 0) {
				sortBy = 'name'; // Reset to default when unsorted
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
			(permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false
		)
	);
	const groups = $derived(getGroups(filteredPermissions));
	const nonAdminRolesCount = $derived(roles.filter((role) => !role.isAdmin).length);

	// Initialize data when component mounts and whenever page data changes
	$effect(() => {
		if (page.data?.permissions?.length > 0) {
			permissionsList = page.data.permissions;
		}
		if (roleData?.length > 0) {
			roles = roleData;
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
	const filterGroups = (permissions: Permission[], group: string): Permission[] => {
		let filtered: Permission[] = [];

		if (group === 'Collection Entries') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.COLLECTION);
		} else if (group === 'User Management') {
			filtered = permissions.filter((cur) => cur.type === PermissionType.USER);
		} else if (group === 'Configuration') {
			filtered = permissions.filter(
				(cur) =>
					cur.type === PermissionType.CONFIGURATION ||
					(cur.type === PermissionType.SYSTEM && cur._id.startsWith('config:'))
			);
		} else if (group === 'System') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('system:')
			);
		} else if (group === 'API Access') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('api:')
			);
		} else if (group === 'Content Management') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('content:')
			);
		} else if (group === 'Media Management') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('media:')
			);
		} else if (group === 'Admin') {
			filtered = permissions.filter(
				(cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('admin:')
			);
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
						...filteredPermissions.map((p) => String(p._id))
					]);
					return { ...role, permissions: Array.from(newPerms) };
				} else {
					// Remove all filtered permissions (String-normalized for consistent hashing)
					const filteredIds = new Set(filteredPermissions.map((p) => String(p._id)));
					return {
						...role,
						permissions: role.permissions.filter((p) => !filteredIds.has(String(p)))
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
			case 'manage':
				return 'bg-tertiary-500/10 text-tertiary-500 dark:bg-tertiary-900/20';
			case 'create':
			case 'write':
				return 'bg-success-500/10 text-success-500 dark:bg-success-900/20';
			case 'delete':
				return 'bg-error-500/10 text-error-500 dark:bg-error-900/20';
			default:
				return 'bg-(--admin-bg-chip) text-(--admin-text-muted)';
		}
	}
</script>

{#if error}
	<p class="error">{error}</p>
{:else}
	<div class="sticky top-0 z-10 mb-6 flex items-center justify-between">
		<div class="w-full">
			<FloatingInput
				bind:value={searchTerm}
				label={access_permissions_search_placeholder()}
				icon="mdi:magnify"
				aria-label={access_permissions_search_aria()}
			/>
		</div>
	</div>

	{#if filteredPermissions.length === 0}
		<div
			class="text-center py-8 border border-dashed border-(--admin-border-default) rounded bg-(--admin-bg-chip)"
		>
			<iconify-icon
				icon="material-symbols:search-off-rounded"
				width="32"
				class="text-(--admin-text-muted) mb-2"
			></iconify-icon>
			<p class="text-(--admin-text-muted) text-sm">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		</div>
	{:else}
		<div
			class="permission overflow-x-auto rounded border border-(--admin-border-default) shadow-sm bg-(--admin-bg-card)"
		>
			<table class="{SMART_TABLE} table-auto">
				<!-- Header -->
				<thead class={SMART_TABLE_THEAD}>
					<tr
						class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
					>
						<th
							class="{SMART_TABLE_TH} w-2/5 text-start!"
							aria-sort={sortBy === 'name'
								? sortOrder === 1
									? 'ascending'
									: 'descending'
								: 'none'}
						>
							<SystemTooltip
								title={access_permissions_sort_name_title()}
								positioning={{ placement: 'top' }}
							>
								<button
									class="inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase transition-colors {sortBy ===
										'name' && sortOrder !== 0
										? 'text-primary-500 dark:text-primary-400'
										: 'text-tertiary-500 hover:text-surface-500 dark:text-primary-500'}"
									onclick={() => handleSort('name')}
									aria-label={access_permissions_sort_name_aria()}
								>
									{access_permissions_name()}
									{#if sortBy === 'name' && sortOrder !== 0}
										<iconify-icon
											icon={sortOrder === 1
												? 'material-symbols:arrow-upward-rounded'
												: 'material-symbols:arrow-downward-rounded'}
											width="14"
											class="shrink-0"
											aria-hidden="true"
										></iconify-icon>
									{/if}
								</button>
							</SystemTooltip>
						</th>
						<th
							class="{SMART_TABLE_TH} w-1/5"
							aria-sort={sortBy === 'action'
								? sortOrder === 1
									? 'ascending'
									: 'descending'
								: 'none'}
						>
							<SystemTooltip
								title={access_permissions_sort_action_title()}
								positioning={{ placement: 'top' }}
							>
								<button
									class="mx-auto inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase transition-colors {sortBy ===
										'action' && sortOrder !== 0
										? 'text-primary-500 dark:text-primary-400'
										: 'text-tertiary-500 hover:text-surface-500 dark:text-primary-500'}"
									onclick={() => handleSort('action')}
									aria-label={access_permissions_sort_action_aria()}
								>
									{access_permissions_action()}
									{#if sortBy === 'action' && sortOrder !== 0}
										<iconify-icon
											icon={sortOrder === 1
												? 'material-symbols:arrow-upward-rounded'
												: 'material-symbols:arrow-downward-rounded'}
											width="14"
											class="shrink-0"
											aria-hidden="true"
										></iconify-icon>
									{/if}
								</button>
							</SystemTooltip>
						</th>

						<!-- List only non-admin roles -->
						{#each roles as role (role._id)}
							{#if !role.isAdmin}
								{@const headerState = getHeaderCheckboxState(role)}
								<th class={SMART_TABLE_TH} scope="col">
									<div class="flex flex-col items-center gap-1.5">
										<SystemTooltip
											title={`Permissions for the ${role.name} role`}
											positioning={{ placement: 'top' }}
											role={null}
											tabindex={null}
										>
											<span class="text-xs font-semibold tracking-wider uppercase">{role.name}</span
											>
										</SystemTooltip>
										<div class="flex items-center gap-1.5 mt-0.5">
											<input
												type="checkbox"
												aria-label={`Select all filtered permissions for ${role.name}`}
												title={`Select/Deselect all filtered permissions for ${role.name}`}
												class="h-4 w-4 rounded-sm border-(--admin-border-default) bg-(--admin-bg-card) text-tertiary-500 dark:text-primary-500 focus:ring-primary-500/20 focus:ring-2 cursor-pointer transition-all"
												checked={headerState.checked}
												indeterminate={headerState.indeterminate}
												onchange={(e) => toggleAllForRole(role._id, e.currentTarget.checked)}
											/>
											<button
												class="flex items-center justify-center p-0.5 rounded-sm border border-(--admin-border-default) hover:bg-(--admin-bg-chip) text-(--admin-text-muted) hover:text-tertiary-500 dark:hover:text-tertiary-500 dark:text-primary-600 transition-colors"
												onclick={() => toggleAllForRole(role._id, true)}
												title={access_permissions_assign_all_title()}
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
				<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
					<!-- Permission Groups -->
					{#each groups as group (group)}
						{#if filterGroups(filteredPermissions, group).length > 0}
							<!-- Group Name -->
							<tr class="bg-surface-500/10 dark:bg-surface-800">
								<td
									colspan={nonAdminRolesCount + 2}
									class="border-y border-surface-500/30 px-2 py-2 text-xs font-bold tracking-wider uppercase text-(--admin-text-body) dark:border-surface-500/40"
								>
									{group}
								</td>
							</tr>
							<!-- Permissions within the Group -->
							{#each filterGroups(filteredPermissions, group) as permission (permission._id)}
								<tr class={SMART_TABLE_ROW_HOVER}>
									<!-- Type -->
									<td
										class="{SMART_TABLE_TD} text-start! text-sm font-medium text-(--admin-text-muted)"
									>
										<span class="inline-flex items-center gap-1.5">
											{permission.name}
											{#if permission.description}
												<SystemTooltip title={permission.description}>
													<HelpIcon ariaLabel={`Help: ${permission.name}`} />
												</SystemTooltip>
											{/if}
										</span>
									</td>
									<!-- Action -->
									<td class={SMART_TABLE_TD}>
										<span
											class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider {getActionBadgeClass(
												permission.action
											)}"
										>
											{permission.action}
										</span>
									</td>
									<!-- Roles -->
									{#each roles as role (role._id)}
										{#if !role.isAdmin}
											<td class={SMART_TABLE_TD}>
												<input
													type="checkbox"
													aria-label={`Toggle ${role.name} for ${permission.name || permission._id}`}
													checked={role.permissions.some(
														(p) => String(p) === String(permission._id)
													)}
													onchange={() => toggleRole(permission._id, role._id)}
													class="h-4 w-4 rounded-sm border-(--admin-border-default) bg-(--admin-bg-card) text-tertiary-500 dark:text-primary-500 focus:ring-primary-500/20 focus:ring-2 cursor-pointer transition-all mx-auto"
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
