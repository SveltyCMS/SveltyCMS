<!--
@file src/routes/(app)/config/accessManagement/Roles.svelte
@description This component manages roles within the application's access management system. 
It provides the following functionality:
- Load and display roles and their associated permissions.
- Allow users to create, edit, and delete roles through a modal interface.
- Implement drag-and-drop reordering of roles using svelte-dnd-action.
- Allow bulk deletion of selected roles.
- Display a skeleton.dev modal for creating or editing roles with an intuitive UI for selecting associated permissions.
-->

<!--
@file src/routes/(app)/config/accessManagement/Roles.svelte
@description This component manages roles within the application's access management system. 
It provides the following functionality:
- Load and display roles and their associated permissions.
- Allow users to create, edit, and delete roles through a modal interface.
- Allow bulk deletion of selected roles.
- Display a skeleton.dev modal for creating or editing roles with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';
	import { authAdapter } from '@src/databases/db';

	// Types
	import type { Role, Permission } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import { Modal } from '@skeletonlabs/skeleton';

	// State stores
	const roleGroups = writable<{ groupName: string; roles: Role[]; uniqueKey: string }[]>([]);
	const availablePermissions = writable<Permission[]>([]);
	const selectedRoles = writable<Set<string>>(new Set());
	const selectedPermissions = writable<Set<string>>(new Set());
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	// Modal state and form inputs
	let isModalOpen = false;
	let isEditMode = false;
	let roleName: string = '';
	let roleDescription: string = ''; // Ensure it's always a string
	let currentRoleId: string | null = null;
	let currentGroupName: string = ''; // Ensure it's always a string

	$: currentUserId = $page.data.user?._id || '';

	// Fetch roles and permissions on mount
	onMount(async () => {
		try {
			await loadRoleGroups();
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false);
		}
	});

	const loadRoleGroups = async () => {
		try {
			const rolesData = $page.data.roles;
			const groups = rolesData.reduce((acc, role, index) => {
				const group = acc.find((g) => g.groupName === role.groupName);
				if (group) {
					group.roles.push(role);
				} else {
					acc.push({
						groupName: role.groupName || 'Ungrouped',
						roles: [role],
						uniqueKey: `${role.groupName || 'Ungrouped'}-${index}`
					});
				}
				return acc;
			}, []);
			roleGroups.set(groups);
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const loadPermissions = async () => {
		try {
			// Ensure authAdapter is initialized
			// if (!authAdapter) {
			// 	throw new Error('Auth adapter is not initialized');
			// }

			// const permissionsData = await authAdapter.getAllPermissions();
			// availablePermissions.set(permissionsData);
			availablePermissions.set($page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const openModal = (role: Role | null = null, groupName: string = '') => {
		isEditMode = !!role;
		currentRoleId = role ? role._id : null;
		roleName = role ? role.name : '';
		roleDescription = role ? role.description || '' : ''; // Provide a default empty string
		currentGroupName = groupName || ''; // Ensure groupName is a string
		selectedPermissions.set(new Set(role?.permissions || [])); // Ensure it's a Set
		isModalOpen = true;
	};

	const closeModal = () => {
		isModalOpen = false;
		roleName = '';
		roleDescription = '';
		currentGroupName = '';
		selectedPermissions.set(new Set());
	};

	const saveRole = async () => {
		if (!roleName) return;

		const roleData: Partial<Role> = {
			name: roleName,
			description: roleDescription,
			groupName: currentGroupName,
			permissions: selectedPermissions
		};

		try {
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}

			if (isEditMode && currentRoleId) {
				await authAdapter.updateRole(currentRoleId, roleData, currentUserId);
			} else {
				await authAdapter.createRole(roleData, currentUserId);
			}

			closeModal();
			await loadRoleGroups();
		} catch (err) {
			error.set(`Failed to ${isEditMode ? 'update' : 'create'} role: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const deleteSelectedRoles = async () => {
		try {
			if (!authAdapter) {
				throw new Error('Auth adapter is not initialized');
			}

			for (const roleId of $selectedRoles) {
				await authAdapter.deleteRole(roleId, currentUserId);
			}
			selectedRoles.set(new Set());
			await loadRoleGroups();
		} catch (err) {
			error.set(`Failed to delete roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const toggleRoleSelection = (roleId: string) => {
		selectedRoles.update((selected) => {
			if (selected.has(roleId)) {
				selected.delete(roleId);
			} else {
				selected.add(roleId);
			}
			return selected;
		});
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
	<Loading customTopText="Loading Roles..." customBottomText="Please wait while roles are being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="my-4">
		<h3 class=":lg:text-left text-center text-lg font-semibold">Roles Management</h3>
		<div class="mb-4 flex items-center justify-between">
			<button on:click={() => openModal(null, '')} class="variant-filled-primary btn">Create New Role</button>
			{#if $selectedRoles.size > 0}
				<button on:click={deleteSelectedRoles} class="variant-filled-danger btn">Delete Selected Roles ({$selectedRoles.size})</button>
			{/if}
		</div>

		<div class="mt-4">
			{#if $roleGroups.length === 0}
				<p>No roles defined yet.</p>
			{:else}
				{#each $roleGroups as group, groupIndex (group.uniqueKey)}
					<div class="mb-4">
						<h5 class=":lg-text-left text-center font-semibold text-tertiary-500 dark:text-primary-500">{group.groupName}</h5>
						<ul class="list-none space-y-2">
							{#each group.roles as role (role._id)}
								<li class="rounded border p-4">
									<div class="flex items-center justify-between">
										<div class="flex items-center">
											<input type="checkbox" checked={$selectedRoles.has(role._id)} on:change={() => toggleRoleSelection(role._id)} class="mr-2" />
											<span>{role.name}</span>
										</div>
										<button on:click={() => openModal(role, group.groupName)} class="variant-filled-secondary btn">Edit</button>
									</div>
									<p>{role.description}</p>
									<ul class="ml-4">
										{#each role.permissions as permissionName}
											<li>{permissionName}</li>
										{/each}
									</ul>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<Modal bind:isOpen={isModalOpen} title={isEditMode ? 'Edit Role' : 'Create Role'}>
		<div class="p-4">
			<input type="text" bind:value={roleName} placeholder="Role Name" class="mb-2 w-full rounded border p-2" />
			<textarea bind:value={roleDescription} placeholder="Role Description" class="mb-2 w-full rounded border p-2"></textarea>
			<input type="text" bind:value={currentGroupName} placeholder="Group Name" class="mb-2 w-full rounded border p-2" />
			<div class="flex flex-wrap gap-2">
				{#each $availablePermissions as permission (permission._id)}
					<label class="flex items-center">
						<input
							type="checkbox"
							checked={$selectedPermissions.has(permission.name)}
							on:change={() => togglePermissionSelection(permission.name)}
							class="mr-2"
						/>
						<span>{permission.name}</span>
					</label>
				{/each}
			</div>
			<div class="footer flex justify-end">
				<button on:click={saveRole} class="variant-filled-primary btn">{isEditMode ? 'Save Changes' : 'Create Role'}</button>
				<button on:click={closeModal} class="variant-filled-secondary btn ml-2">Cancel</button>
			</div>
		</div>
	</Modal>
{/if}
