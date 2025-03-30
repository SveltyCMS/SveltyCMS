<!--
@file src/routes/(app)/config/accessManagement/Roles.svelte
@component
**This component manages roles within the application's access management system**

@example
<Roles />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

### Features
- Load and display roles and their associated permissions.
- Allow users to create, edit, and delete roles through a modal interface.
- Allow bulk deletion of selected roles.
- Display a skeleton.dev modal for creating or editing roles with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// Store
	import { writable } from 'svelte/store';
	import { page } from '$app/state';

	// Auth
	import type { Role, Permission } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';

	// Modal
	import RoleModal from './RoleModal.svelte';

	// Skeleton
	import { popup, type PopupSettings, getToastStore } from '@skeletonlabs/skeleton'; // Use base path for v3

	const toastStore = getToastStore();

	// Svelte DND-actions
	import { dndzone } from 'svelte-dnd-action';
	import { v4 as uuidv4 } from 'uuid';

	const flipDurationMs = 100;

	let { roleData, setRoleData, updateModifiedCount } = $props();

	const roles = writable<Role[]>([]);
	const availablePermissions = writable<Permission[]>([]);
	const selectedRoles = writable<Set<string>>(new Set());
	const isLoading = writable(true);
	const error = writable<string | null>(null);
	let modifiedRoles = new Set<string>();

	// Modal state
	let isEditMode = false;
	let items: any = $state();

	// Modal state
	let isRoleModalOpen = $state(false);
	// Define props type matching RoleModal's expected props (non-partial for required ones)
	let roleModalProps = $state<{
		isEditMode: boolean; // Required
		currentRoleId: string | null; // Required (can be null)
		roleName: string; // Required
		roleDescription: string; // Required
		currentGroupName: string; // Required
		selectedPermissions: string[]; // Required
		availablePermissions: Permission[]; // Required
	}>({
		// Provide default values matching expected types
		isEditMode: false,
		currentRoleId: null,
		roleName: '',
		roleDescription: '',
		currentGroupName: '',
		selectedPermissions: [],
		availablePermissions: []
	}); // Props for the modal instance

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
			// Add id property for dndzone while keeping _id for data
			const rolesWithId = roleData.map((role: Role) => ({ ...role, id: role._id }));
			roles.set(rolesWithId);
			items = rolesWithId;
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const loadPermissions = async () => {
		try {
			availablePermissions.set(page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Updated function to open the modal via state and props
	const openModal = (role: Role | null = null, groupName = '') => {
		const isEditMode = !!role;
		roleModalProps = {
			isEditMode: isEditMode,
			currentRoleId: role ? role._id : null,
			roleName: role?.name || '',
			roleDescription: role?.description || '',
			currentGroupName: groupName || '',
			selectedPermissions: role?.permissions || [],
			availablePermissions: $availablePermissions // Pass available permissions
		};
		isRoleModalOpen = true;
	};

	// Updated function to save a role
	const saveRole = async (formData: {
		roleName: string;
		roleDescription: string;
		currentGroupName: string;
		selectedPermissions: string[];
		currentRoleId: string | null;
	}) => {
		// Correct destructuring from formData parameter
		const { roleName, roleDescription, currentGroupName, selectedPermissions, currentRoleId } = formData;
		if (!roleName) return;

		const roleId = currentRoleId ?? uuidv4();
		// Update isEditMode based on whether currentRoleId was passed back
		isEditMode = !!currentRoleId;
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

		roles.set(items);
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
			success: 'preset-filled-primary-500',
			info: 'preset-filled-tertiary-500',
			error: 'preset-filled-error-500'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 rounded-md!'
		});
	}

	const deleteSelectedRoles = async () => {
		for (const roleId of $selectedRoles) {
			const index = items.findIndex((cur: { _id: string }) => cur._id === roleId);
			items.splice(index, 1);
			modifiedRoles.add(roleId);
		}
		items = [...items];
		roles.set(items);
		selectedRoles.set(new Set());
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
		selectedRoles.update((selected) => {
			if (selected.has(roleId)) {
				selected.delete(roleId);
			} else {
				selected.add(roleId);
			}
			return selected;
		});
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
		roles.set(items);
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
		roles.set(items);
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

<!-- Add RoleModal instance, controlled by state, using callback props -->
<RoleModal bind:open={isRoleModalOpen} {...roleModalProps} onSubmit={saveRole} onClose={() => (isRoleModalOpen = false)} />

{#if $isLoading}
	<Loading customTopText="Loading Roles..." customBottomText="" />
{:else if $error}
	<p class="error">{$error}</p>
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
			<button onclick={deleteSelectedRoles} class="preset-filled-error-500 btn" disabled={$selectedRoles.size === 0}>
				Delete Roles ({$selectedRoles.size})
			</button>
		</div>

		<div class="role mt-4 flex-1 overflow-auto">
			{#if $roles.length === 0}
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
							<div class="animate-flip hover:bg-surface-500 flex items-center justify-between rounded-sm border p-4 md:flex-row">
								<div class="flex items-center gap-2">
									<!-- Drag Icon -->
									<iconify-icon icon="mdi:drag" width="18" class="cursor-move text-gray-500 dark:text-gray-300"></iconify-icon>

									{#if !role.isAdmin}
										<input type="checkbox" checked={$selectedRoles.has(role._id)} onchange={() => toggleRoleSelection(role._id)} class="mr-2" />
									{/if}

									<!-- Role Name with Tooltip -->
									<span class="text-tertiary-500 dark:text-primary-500 flex items-center text-xl font-semibold">
										{role.name}

										{#if role.description}
											<iconify-icon
												icon="material-symbols:info"
												width="18"
												class="text-tertiary-500 dark:text-primary-500 ml-1"
												use:popup={getPopupSettings(role._id)}
											></iconify-icon>
											<div class="card preset-filled-surface-500 p-4" data-popup="role-{role._id}">
												{role.description}
												<div class="arrow"></div>
											</div>
										{/if}
									</span>
								</div>

								<!-- Description for larger screens -->
								<p class="mt-2 hidden text-sm text-gray-600 md:mt-0 md:ml-4 md:block dark:text-gray-400">
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
