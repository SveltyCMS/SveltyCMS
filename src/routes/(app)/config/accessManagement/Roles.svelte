<!--
@file src/routes/(app)/config/accessManagement/Roles.svelte
@component
**This component manages roles within the application's access management system**

@xample
<Roles />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

It provides the following functionality:
- Load and display roles and their associated permissions.
- Allow users to create, edit, and delete roles through a modal interface.
- Allow bulk deletion of selected roles.
- Display a skeleton.dev modal for creating or editing roles with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
	// Store

	// Auth
	import type { Role } from '@src/databases/auth/types';
	// Components
	import RoleModal from './RoleModal.svelte';
	// Skeleton
	import { modalState } from '@utils/modalState.svelte';
	import { toaster } from '@stores/store.svelte';
	// Svelte DND-actions
	import { dndzone } from 'svelte-dnd-action';
	import { v4 as uuidv4 } from 'uuid';

	const flipDurationMs = 100;

	const { roleData, setRoleData, updateModifiedCount } = $props();

	// Reactive state
	let roles: Role[] = $state([]);
	let selectedPermissions: string[] = $state([]);
	let selectedRoles = $state(new Set());
	const error = $state<string | null>(null);
	const modifiedRoles = $state(new Set());
	// Define DndItem type for dndzone compatibility
	type DndItem = Role & { id: string };
	let items: DndItem[] = $state([]);

	// Modal state
	let isEditMode = $state(false);
	let currentRoleId: string | null = $state(null);
	let currentGroupName = $state('');

	// Initialize data when component mounts (run once)
	$effect(() => {
		// Only initialize if data hasn't been loaded yet
		if (roles.length === 0 && roleData.length > 0) {
			const rolesWithId = roleData.map((role: Role) => ({ ...role, id: role._id }));
			roles = rolesWithId;
			items = rolesWithId;
		}
	});

	const openModal = (role: Role | null = null, groupName = '') => {
		isEditMode = !!role;
		currentRoleId = role ? role._id : null;
		currentGroupName = groupName || '';
		selectedPermissions = role?.permissions || [];

		modalState.trigger(RoleModal as any, {
			isEditMode,
			currentRoleId,
			roleName: role?.name || '',
			roleDescription: role?.description || '',
			currentGroupName,
			selectedPermissions,
			response: (formData: any) => {
				if (formData) {
					saveRole(formData);
				}
			},
			title: isEditMode ? 'Edit Role' : 'Create Role'
		});
	};

	const saveRole = async (role: {
		roleName: string;
		roleDescription: string;
		currentGroupName: string;
		selectedPermissions: string[];
		currentRoleId: string | null;
	}) => {
		const { roleName, roleDescription, currentGroupName, selectedPermissions, currentRoleId } = role;
		if (!roleName) return;

		const roleId = currentRoleId ?? uuidv4().replace(/-/g, '');
		const newRole = {
			_id: roleId,
			id: roleId, // Add id for dndzone
			name: roleName,
			description: roleDescription,
			groupName: currentGroupName,
			permissions: selectedPermissions
		};

		if (!isEditMode) {
			items = [...items, newRole];
			modifiedRoles.add(roleId);
			toaster.info({ description: 'Role added. Click "Save" at the top to apply changes.' });
		} else if (currentRoleId) {
			const index = items.findIndex((cur: { _id: string }) => cur._id === currentRoleId);
			items[index] = newRole;
			items = [...items];
			modifiedRoles.add(currentRoleId);
			toaster.info({ description: 'Role updated. Click "Save" at the top to apply changes.' });
		}

		roles = items;
		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	};

	const deleteSelectedRoles = async () => {
		for (const roleId of selectedRoles) {
			const index = items.findIndex((cur: { _id: string }) => cur._id === roleId);
			items.splice(index, 1);
			modifiedRoles.add(roleId);
		}
		items = [...items];
		roles = items;
		selectedRoles = new Set();
		toaster.info({ description: 'Roles deleted. Click "Save" at the top to apply changes.' });

		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	};

	const toggleRoleSelection = (roleId: string) => {
		const newSelection = new Set(selectedRoles);
		if (newSelection.has(roleId)) {
			newSelection.delete(roleId);
		} else {
			newSelection.add(roleId);
		}
		selectedRoles = newSelection;
	};

	// DndItem type already defined above

	function handleSort(e: CustomEvent) {
		items = [...e.detail.items];
		roles = items;
		// Find the item that was moved by id
		const movedItem = e.detail.items.find((item: DndItem) => item.id === e.detail.info.id);
		if (movedItem) {
			modifiedRoles.add(movedItem._id);
		}

		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	}

	function handleFinalize(e: CustomEvent) {
		items = [...e.detail.items];
		roles = items;
		// Find the item that was moved by id
		const movedItem = e.detail.items.find((item: DndItem) => item.id === e.detail.info.id);
		if (movedItem) {
			modifiedRoles.add(movedItem._id);
		}

		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	}
</script>

{#if error}
	<p class="error">{error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Roles Management:</h3>

	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Manage user roles and their access permissions. You can create, edit, or delete roles and assign specific permissions to them.
	</p>

	<div class="wrapper my-4">
		<div class="mb-4 flex items-center justify-between">
			<!-- Create -->
			<button onclick={() => openModal(null, '')} class="preset-filled-primary-500 btn">Create Role</button>
			<!-- Delete -->
			<button onclick={deleteSelectedRoles} class="preset-filled-error-500 btn" disabled={selectedRoles.size === 0}>
				Delete Roles ({selectedRoles.size})
			</button>
		</div>

		<div class="role mt-4 flex-1 overflow-auto">
			{#if roles.length === 0}
				<p>No roles defined yet.</p>
			{:else}
				<div class="rounded-8">
					<section
						class="list-none space-y-2"
						use:dndzone={{ items: items, flipDurationMs, type: 'column' }}
						onconsider={handleSort}
						onfinalize={handleFinalize}
					>
						{#each items as role (role.id)}
							<div class="animate-flip flex items-center justify-between rounded border p-2 hover:bg-surface-500 md:flex-row">
								<div class="flex items-center gap-2">
									<!-- Drag Icon -->
									<iconify-icon icon="mdi:drag" width="18" class="cursor-move text-gray-500 dark:text-gray-300"></iconify-icon>

									{#if !role.isAdmin}
										<input type="checkbox" checked={selectedRoles.has(role._id)} onchange={() => toggleRoleSelection(role._id)} class="mr-2" />
									{/if}

									<!-- Role Name with Tooltip -->
									<span class="flex items-center text-xl font-semibold text-tertiary-500 dark:text-primary-500">
										{role.name}

										{#if role.description}
											<iconify-icon
												icon="material-symbols:info"
												width="18"
												class="ml-1 text-tertiary-500 dark:text-primary-500"
												title={role.description}
											></iconify-icon>
										{/if}
									</span>
								</div>

								<!-- Description for larger screens -->
								<p class="mt-2 hidden text-sm text-gray-600 dark:text-gray-400 md:ml-4 md:mt-0 md:block">
									{role.description}
								</p>

								<!-- Edit Button: changes layout depending on screen size -->
								<button onclick={() => openModal(role)} aria-label="Edit role" class="preset-filled-secondary-500 btn">
									<iconify-icon icon="mdi:pencil" class="text-white" width="18"></iconify-icon>
									<span class="hidden md:block">Edit</span>
								</button>
							</div>
						{/each}
					</section>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.role {
		height: calc(100vh - 350px);
	}
</style>
