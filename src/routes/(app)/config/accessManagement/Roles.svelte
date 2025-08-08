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
	import { page } from '$app/state';

	// Auth
	import type { Role, Permission } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import RoleModal from './RoleModal.svelte';

	// Skeleton
	import { getToastStore, getModalStore, type ModalSettings, type PopupSettings, popup } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Svelte DND-actions
	import { dndzone } from 'svelte-dnd-action';
	import { v4 as uuidv4 } from 'uuid';

	const flipDurationMs = 100;

	let { roleData, setRoleData, updateModifiedCount } = $props();

	// Reactive state
	let roles = $state<Role[]>([]);
	let availablePermissions = $state<Permission[]>([]);
	let selectedPermissions = $state<string[]>([]);
	let selectedRoles = $state<Set<string>>(new Set());
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let modifiedRoles = $state(new Set<string>());
	let items = $state<Role[]>([]);

	// Modal state
	let isEditMode = $state(false);
	let currentRoleId = $state<string | null>(null);
	let currentGroupName = $state('');

	// Initialize data when component mounts
	$effect(() => {
		loadData();
	});

	const loadData = async () => {
		try {
			await loadRoleGroups();
			await loadPermissions();
		} catch (err) {
			error = `Failed to initialize: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isLoading = false;
		}
	};

	const loadRoleGroups = async () => {
		try {
			// Add id property for dndzone while keeping _id for data
			const rolesWithId = roleData.map((role: Role) => ({ ...role, id: role._id }));
			roles = rolesWithId;
			items = rolesWithId;
		} catch (err) {
			error = `Failed to load roles: ${err instanceof Error ? err.message : String(err)}`;
		}
	};

	const loadPermissions = async () => {
		try {
			availablePermissions = page.data.permissions;
		} catch (err) {
			error = `Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`;
		}
	};

	const openModal = (role: Role | null = null, groupName = '') => {
		isEditMode = !!role;
		currentRoleId = role ? role._id : null;
		currentGroupName = groupName || '';
		selectedPermissions = role?.permissions || [];

		const modal: ModalSettings = {
			type: 'component',
			component: {
				ref: RoleModal,
				props: {
					isEditMode,
					currentRoleId,
					roleName: role?.name || '',
					roleDescription: role?.description || '',
					currentGroupName,
					selectedPermissions
				}
			},
			title: isEditMode ? 'Edit Role' : 'Create Role',
			buttonTextCancel: 'Cancel',
			buttonTextConfirm: isEditMode ? 'Update' : 'Create',
			response: (formData: any) => {
				if (formData) {
					saveRole(formData);
				}
			}
		};
		modalStore.trigger(modal);
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
			showToast('Role added. Click "Save" at the top to apply changes.', 'info');
		} else if (currentRoleId) {
			const index = items.findIndex((cur: { _id: string }) => cur._id === currentRoleId);
			items[index] = newRole;
			items = [...items];
			modifiedRoles.add(currentRoleId);
			showToast('Role updated. Click "Save" at the top to apply changes.', 'info');
		}

		roles = items;
		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	};

	// Show corresponding Toast messages
	function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
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

	const deleteSelectedRoles = async () => {
		for (const roleId of selectedRoles) {
			const index = items.findIndex((cur: { _id: string }) => cur._id === roleId);
			items.splice(index, 1);
			modifiedRoles.add(roleId);
		}
		items = [...items];
		roles = items;
		selectedRoles = new Set();
		showToast('Roles deleted. Click "Save" at the top to apply changes.', 'info');

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

	// Types for DND events
	type DndItem = Role & { id: string };

	function handleSort(
		e: CustomEvent<{
			items: DndItem[];
			info: {
				id: number;
			};
		}>
	) {
		items = [...e.detail.items];
		roles = items;
		modifiedRoles.add(e.detail.items[e.detail.info.id]._id);

		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	}

	function handleFinalize(
		e: CustomEvent<{
			items: DndItem[];
			info: {
				id: number;
			};
		}>
	) {
		items = [...e.detail.items];
		roles = items;
		modifiedRoles.add(e.detail.items[e.detail.info.id]._id);

		// Remove id property when sending data to parent
		const cleanedItems = items.map(({ id, ...item }: { id: string; [key: string]: any }) => item);
		setRoleData(cleanedItems);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	}

	function getPopupSettings(roleId: string): PopupSettings {
		return {
			event: 'hover',
			target: `role-${roleId}`,
			placement: 'right'
		};
	}
</script>

{#if isLoading}
	<Loading customTopText="Loading Roles..." customBottomText="" />
{:else if error}
	<p class="error">{error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Roles Management:</h3>

	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Manage user roles and their access permissions. You can create, edit, or delete roles and assign specific permissions to them.
	</p>

	<div class="wrapper my-4">
		<div class="mb-4 flex items-center justify-between">
			<!-- Create -->
			<button onclick={() => openModal(null, '')} class="variant-filled-primary btn">Create Role</button>
			<!-- Delete -->
			<button onclick={deleteSelectedRoles} class="variant-filled-error btn" disabled={selectedRoles.size === 0}>
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
												use:popup={getPopupSettings(role._id)}
											></iconify-icon>
											<div class="card variant-filled-surface p-4" data-popup="role-{role._id}">
												{role.description}
												<div class="arrow"></div>
											</div>
										{/if}
									</span>
								</div>

								<!-- Description for larger screens -->
								<p class="mt-2 hidden text-sm text-gray-600 dark:text-gray-400 md:ml-4 md:mt-0 md:block">
									{role.description}
								</p>

								<!-- Edit Button: changes layout depending on screen size -->
								<button onclick={() => openModal(role)} aria-label="Edit role" class="variant-filled-secondary btn">
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

<style lang="postcss">
	.role {
		height: calc(100vh - 350px);
	}
</style>
