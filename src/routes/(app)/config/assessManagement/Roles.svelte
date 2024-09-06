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
	import { invalidateAll } from '$app/navigation';

	// Store
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';
	import { authAdapter } from '@src/databases/db';

	// Types
	import type { Role, Permission } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import RoleModal from './RoleModal.svelte';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { createRandomID } from '@src/utils/utils';

	const flipDurationMs = 100;

	const roles = writable<Role[]>([]);
	const availablePermissions = writable<Permission[]>([]);
	let selectedPermissions = [];
	const selectedRoles = writable<Set<string>>(new Set());
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
	let items: any;

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
			roles.set(rolesData.map((cur) => ({ ...cur, id: cur._id })));
			items = rolesData.map((cur) => ({ ...cur, id: cur._id }));
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const loadPermissions = async () => {
		try {
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
		selectedPermissions = role?.permissions || []; // Ensure it's a Set
		isModalOpen = true;
		const modalComponent: ModalComponent = {
			ref: RoleModal,
			props: {
				isEditMode,
				currentRoleId,
				roleName,
				roleDescription,
				currentGroupName,
				selectedPermissions,
				availablePermissions
			}
		};
		const modal: ModalSettings = {
			type: 'component',
			component: modalComponent,
			title: isEditMode ? 'Edit Role' : 'Create Role',
			body: isEditMode ? 'Edit an existing Role' : 'Create and describe a new Role',
			response: (role) => {
				saveRole(role);
			}
		};
		modalStore.trigger(modal);
		console.log(isEditMode, currentRoleId, roleName, roleDescription, currentGroupName, selectedPermissions, availablePermissions, isModalOpen);
	};

	const closeModal = () => {
		isModalOpen = false;
		roleName = '';
		roleDescription = '';
		currentGroupName = '';
		selectedPermissions = [];
		modalStore.close();
	};

	const saveRole = async (role) => {
		const { roleName, roleDescription, currentGroupName, selectedPermissions, currentRoleId } = role;
		if (!roleName) return;

		const roleData: Role = {
			name: roleName,
			description: roleDescription,
			groupName: currentGroupName,
			permissions: selectedPermissions
		};

		if (!isEditMode) {
			try {
				const response = await fetch('/api/role/create', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ roleData: { ...roleData, _id: await createRandomID() }, currentUserId })
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
				items.push(roleData);
				roles.set(items);
				// isLoading.set(true);
				invalidateAll();
			} catch (error) {
				showToast('Network error occurred while updating config file', 'error');
			}
		} else {
			try {
				const response = await fetch('/api/role/update', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ currentRoleId, roleData, currentUserId })
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
				const index = items.findIndex((cur) => cur._id === currentRoleId);
				items.splice(index, 1);
				roles.set(items);
				isLoading.set(true);
				invalidateAll().then(() => {
					isLoading.set(false);
				});
			} catch (error) {
				showToast(`Network error occurred while updating config file ${error}`, 'error');
			}
		}
	};

	const saveAllRoles = async () => {
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
			invalidateAll().then(() => {
				isLoading.set(false);
			});
		} catch (error) {
			showToast('Network error occurred while updating config file', 'error');
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

	const deleteSelectedRoles = async () => {
		try {
			for (const roleId of $selectedRoles) {
				const response = await fetch('/api/role/delete', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ roleId, currentUserId })
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
				const index = items.findIndex((cur) => cur._id === roleId);
				items.splice(index, 1);
				roles.set(items);
				isLoading.set(true);
				invalidateAll().then(() => {
					isLoading.set(false);
				});
			}
			selectedRoles.set(new Set());
		} catch (err) {
			showToast('Network error occurred while updating config file', 'error');
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

	function handleSort(e) {
		items = [...e.detail.items];
		roles.set(items);
	}

	function handleFinalize(e) {
		items = [...e.detail.items];
		roles.set(items);
		saveAllRoles();
	}
</script>

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
			<button on:click={() => openModal(null, '')} class="variant-filled-primary btn">Create Role</button>
			<!-- Delete -->
			<button on:click={deleteSelectedRoles} class="variant-filled-error btn" disabled={$selectedRoles.size === 0}>
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
						on:consider={handleSort}
						on:finalize={handleFinalize}
					>
						{#each items as role (role.id)}
							<div class="rounded border p-4" animate:flip={{ duration: flipDurationMs }}>
								<div class="flex items-center justify-between">
									<div class="flex items-center">
										{#if !role.isAdmin}
											<input type="checkbox" checked={$selectedRoles.has(role._id)} on:change={() => toggleRoleSelection(role._id)} class="mr-2" />
										{/if}
										<span class="text-xl font-semibold text-tertiary-500 dark:text-primary-500">{role.name}</span>
									</div>
									<button on:click={() => openModal(role)} class="variant-filled-secondary btn">Edit</button>
								</div>
								<p>{role.description}</p>
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
	@media screen and (max-width: 625px) {
		.role {
			height: 280px;
		}
	}
</style>
