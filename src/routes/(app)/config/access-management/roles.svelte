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
	import { toast } from '@src/stores/toast.svelte.ts';
	// Auth
	import type { Role } from '@src/databases/auth/types';
	// Skeleton
	import { modalState } from '@utils/modal-state.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { dndzone } from 'svelte-dnd-action';
	// Components
	import RoleModal from './role-modal.svelte';

	const flipDurationMs = 100;

	interface Props {
		roleData: any;
		setRoleData: (data: any) => void;
		updateModifiedCount?: (count: number) => void;
		permissions?: import('@src/databases/auth/types').Permission[];
	}

	let { roleData, setRoleData, updateModifiedCount, permissions = [] }: Props = $props();

	// Roles State
	let roles: (Role & { id: string })[] = $state([]);
	let roleSearchTerm = $state('');
	let error = $state<string | null>(null);

	// Derived items for display (filtering)
	const filteredRoles = $derived(
		roles.filter(
			(r) => r.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) || r.description?.toLowerCase().includes(roleSearchTerm.toLowerCase())
		)
	);

	// Tracking changes
	const modifiedRoles = new SvelteSet<string>();
	let selectedRoles = new SvelteSet<string>();

	// Modal state
	let isEditMode = $state(false);
	let currentRoleId: string | null = $state(null);
	let currentGroupName = $state('');

	// Initialize data when component mounts (run once)
	$effect(() => {
		// Only initialize if data hasn't been loaded yet
		if (roles.length === 0 && roleData.length > 0) {
			const rolesWithId = roleData.map((role: Role) => ({
				...role,
				id: role._id
			}));
			roles = rolesWithId;
		}
	});

	const openModal = (role: Role | null = null, groupName = '') => {
		isEditMode = !!role;
		currentRoleId = role ? role._id : null;
		currentGroupName = groupName || '';

		modalState.trigger(RoleModal as any, {
			isEditMode,
			currentRoleId,
			roleName: role?.name || '',
			roleDescription: role?.description || '',
			currentGroupName,
			selectedPermissions: role?.permissions || [],
			permissions, // Pass available permissions to the modal
			roles, // Pass available roles to copy from
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
		if (!roleName) {
			return;
		}

		const roleId = currentRoleId ?? crypto.randomUUID().replace(/-/g, '');
		const newRole = {
			_id: roleId,
			id: roleId,
			name: roleName,
			description: roleDescription,
			groupName: currentGroupName,
			permissions: selectedPermissions
		};

		if (!isEditMode) {
			roles = [...roles, newRole];
			modifiedRoles.add(roleId);
			toast.info('Role added. Save to apply.');
		} else if (currentRoleId) {
			const index = roles.findIndex((r) => r._id === currentRoleId);
			roles[index] = newRole;
			roles = [...roles];
			modifiedRoles.add(currentRoleId);
			toast.info('Role updated. Save to apply.');
		}

		// Sync to parent
		const cleanedRoles = roles.map(({ id, ...rest }) => rest);
		setRoleData(cleanedRoles);

		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	};

	const deleteSelectedRoles = async () => {
		for (const roleId of selectedRoles) {
			const index = roles.findIndex((cur: { _id: string }) => cur._id === roleId);
			if (index !== -1) {
				roles.splice(index, 1);
				modifiedRoles.add(roleId);
			}
		}
		roles = [...roles];
		selectedRoles.clear();
		toast.info('Roles deleted. Save to apply.');

		// Sync to parent
		const cleanedRoles = roles.map(({ id, ...rest }) => rest);
		setRoleData(cleanedRoles);

		// Notify the parent about the number of changes
		if (updateModifiedCount) {
			updateModifiedCount(modifiedRoles.size);
		}
	};

	const toggleRoleSelection = (roleId: string) => {
		if (selectedRoles.has(roleId)) {
			selectedRoles.delete(roleId);
		} else {
			selectedRoles.add(roleId);
		}
	};

	// DndItem type already defined above

	function handleSort(e: CustomEvent) {
		roles = [...e.detail.items];
		const movedItem = e.detail.items.find((item: any) => item.id === e.detail.info.id);
		if (movedItem) modifiedRoles.add(movedItem._id);

		const cleanedRoles = roles.map(({ id, ...rest }) => rest);
		setRoleData(cleanedRoles);
		if (updateModifiedCount) updateModifiedCount(modifiedRoles.size);
	}

	function handleFinalize(e: CustomEvent) {
		roles = [...e.detail.items];
		const movedItem = e.detail.items.find((item: any) => item.id === e.detail.info.id);
		if (movedItem) modifiedRoles.add(movedItem._id);

		const cleanedRoles = roles.map(({ id, ...rest }) => rest);
		setRoleData(cleanedRoles);
		if (updateModifiedCount) updateModifiedCount(modifiedRoles.size);
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
		<div class="mb-4 flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-2">
				<button onclick={() => openModal(null, '')} class="preset-filled-primary-500 btn">
					<iconify-icon icon="mdi:plus-circle-outline" class="mr-2"></iconify-icon>
					Create Role
				</button>
				<button onclick={deleteSelectedRoles} class="preset-filled-error-500 btn" disabled={selectedRoles.size === 0}>
					Delete Selected ({selectedRoles.size})
				</button>
			</div>

			<div class="relative w-full max-w-sm">
				<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
				<input type="text" placeholder="Search roles..." class="input pl-10" bind:value={roleSearchTerm} aria-label="Search roles" />
			</div>
		</div>

		<div class="role mt-4 flex-1 overflow-auto">
			{#if roles.length === 0}
				<p>No roles defined yet.</p>
			{:else}
				<div class="rounded-8">
					<p class="sr-only" id="roles-dnd-instructions">
						Press Enter or Space to select a role for reordering. Use Up and Down arrow keys to move the selected role. Press Enter or Space again to
						drop.
					</p>
					<ul
						class="list-none space-y-2"
						use:dndzone={{ items: filteredRoles, flipDurationMs, type: 'column' }}
						onconsider={handleSort}
						onfinalize={handleFinalize}
						aria-describedby="roles-dnd-instructions"
						role="list"
					>
						{#each filteredRoles as role (role.id)}
							<li
								class="animate-flip flex items-center justify-between rounded border p-2 hover:bg-surface-200 dark:hover:bg-surface-700 md:flex-row transition-colors"
								role="listitem"
							>
								<div class="flex items-center gap-2">
									<!-- Drag Icon -->
									<div
										class="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-300 dark:hover:bg-surface-600"
										role="button"
										tabindex="0"
										aria-label="Drag to reorder {role.name}"
									>
										<iconify-icon icon="mdi:drag" width={24}></iconify-icon>
									</div>

									{#if !role.isAdmin}
										<input
											type="checkbox"
											checked={selectedRoles.has(role._id)}
											onchange={() => toggleRoleSelection(role._id)}
											class="checkbox"
											aria-label={`Select ${role.name} for deletion`}
										/>
									{/if}

									<!-- Role Name with Description hidden on small screens -->
									<div class="flex flex-col">
										<span class="flex items-center text-lg font-bold text-tertiary-500 dark:text-primary-500">
											{role.name}
											{#if role.isAdmin}
												<span class="ml-2 badge variant-filled-secondary text-xs">Admin</span>
											{/if}
										</span>
										<span class="text-xs opacity-60 md:hidden">{role.description || 'No description'}</span>
									</div>
								</div>

								<!-- Description for larger screens -->
								<p class="mt-2 hidden text-sm opacity-70 md:ml-4 md:mt-0 md:block flex-1">{role.description}</p>

								<!-- Actions -->
								<div class="flex gap-2">
									<button onclick={() => openModal(role)} aria-label={`Edit role ${role.name}`} class="btn btn-sm variant-soft-secondary">
										<iconify-icon icon="mdi:pencil" width={18} class="mr-1"></iconify-icon>
										Edit
									</button>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.role {
		height: calc(100vh - 350px);
	}
	:global([data-is-dnd-shadow-item='true']) {
		opacity: 0.75 !important;
		background: var(--color-surface-400) !important;
		border: 2px dashed var(--color-primary-500) !important;
	}
</style>
