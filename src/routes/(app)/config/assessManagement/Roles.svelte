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

	// Store
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';

	// Auth
	import type { Role, Permission } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import RoleModal from './RoleModal.svelte';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings, type PopupSettings, popup } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Define the getTooltipSettings function here
	const getTooltipSettings = (description: string): PopupSettings => ({
		event: 'hover',
		content: description,
		placement: 'right',
		trigger: 'hover focus'
	});

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { createRandomID } from '@utils/utils';

	const flipDurationMs = 100;

	export let roleData;
	export let setRoleData;
	export let updateModifiedCount;

	const roles = writable<Role[]>([]);
	const availablePermissions = writable<Permission[]>([]);
	let selectedPermissions: string[] = [];
	const selectedRoles = writable<Set<string>>(new Set());
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	// Modal state and form inputs
	let isModalOpen = false;
	let isEditMode = false;
	let roleName: string = '';
	let roleDescription: string = '';
	let currentRoleId: string | null = null;
	let currentGroupName: string = '';

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
			roles.set(roleData.map((cur) => ({ ...cur, id: cur._id })));
			items = roleData.map((cur) => ({ ...cur, id: cur._id }));
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
		roleDescription = role ? role.description || '' : '';
		currentGroupName = groupName || '';
		selectedPermissions = role?.permissions || [];
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
	};

	const saveRole = async (role) => {
		const { roleName, roleDescription, currentGroupName, selectedPermissions, currentRoleId } = role;
		if (!roleName) return;

		const newRole: Role = {
			_id: currentRoleId ?? createRandomID(), // Ensure _id is provided
			name: roleName,
			description: roleDescription,
			groupName: currentGroupName,
			permissions: selectedPermissions
		};

		if (!isEditMode) {
			const id = createRandomID();
			items.push({ ...newRole, _id: id, id });
			items = [...items];
			roles.set(items);
			setRoleData(items);
		} else {
			const index = items.findIndex((cur) => cur._id === currentRoleId);
			const item = items[index];
			items.splice(index, 1, { ...item, ...newRole });
			items = [...items];
			roles.set(items);
			setRoleData(items);
		}

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(items.length);
		}

		showToast('Role saved successfully', 'success');
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
		for (const roleId of $selectedRoles) {
			const index = items.findIndex((cur) => cur._id === roleId);
			items.splice(index, 1);
			roles.set(items);
		}
		selectedRoles.set(new Set());

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(items.length);
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

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(items.length);
		}
	}

	function handleFinalize(e) {
		items = [...e.detail.items];
		roles.set(items);
		setRoleData(items);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(items.length);
		}
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
							<div class=" animate-flip flex items-center justify-between rounded border p-4 hover:bg-surface-500 md:flex-row">
								<div class="flex items-center gap-2">
									<!-- Drag Icon -->
									<iconify-icon icon="mdi:drag" width="18" class="cursor-move text-gray-500 dark:text-gray-300" />

									{#if !role.isAdmin}
										<input type="checkbox" checked={$selectedRoles.has(role._id)} on:change={() => toggleRoleSelection(role._id)} class="mr-2" />
									{/if}

									<!-- Role Name with Tooltip -->
									<span class="flex items-center text-xl font-semibold text-tertiary-500 dark:text-primary-500">
										{role.name}

										<iconify-icon
											icon="material-symbols:info"
											width="18"
											class="ml-1 text-tertiary-500 dark:text-primary-500"
											use:popup={getTooltipSettings(role.description)}
										/>
									</span>
								</div>

								<!-- Description for larger screens -->
								<p class="mt-2 hidden text-sm text-gray-600 dark:text-gray-400 md:ml-4 md:mt-0 md:block">
									{role.description}
								</p>

								<!-- Edit Button: changes layout depending on screen size -->
								<button on:click={() => openModal(role)} class="variant-filled-secondary btn">
									<iconify-icon icon="mdi:pencil" class="text-white" width="18" />
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
