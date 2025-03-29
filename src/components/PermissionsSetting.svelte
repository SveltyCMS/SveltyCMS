<!-- 
@file src/components/PermissionsSetting.svelte
@component
**Enhanced Permissions Setting Component for managing widget field permissions**

@example
<PermissionsSetting />

#### Props
- `permissions` {object} - The current permissions object
- `on:update` {function} - A function to update the permissions object

Features:
- Shows admin role info separately
- Bulk permission actions
- Permission presets
-->
<script lang="ts">
	import { roles } from '@root/config/roles';
	import { PermissionAction } from '@src/auth/permissionTypes';

	// Skeleton
	import { getContext } from 'svelte';
	import { type ToastContext } from '@skeletonlabs/skeleton-svelte';

	export const toast: ToastContext = getContext('toast');

	interface Props {
		permissions?: Record<string, Record<PermissionAction, boolean>>;
		'on:update'?: (permissions: Record<string, Record<PermissionAction, boolean>>) => void;
	}

	let { permissions = {}, 'on:update': onUpdate = () => {} }: Props = $props();

	// Local state
	let error: string | null = $state(null);
	let searchQuery = $state('');

	// Convert permissions object to include all roles with default values
	function initializePermissions() {
		const initializedPermissions = { ...permissions };

		// Ensure all roles have entries
		roles.forEach((role) => {
			if (!initializedPermissions[role._id]) {
				initializedPermissions[role._id] = {
					create: true,
					read: true,
					update: true,
					delete: true,
					manage: true,
					share: true,
					access: true,
					execute: true
				};
			}
		});

		return initializedPermissions;
	}

	let permissionsState = $state(initializePermissions());

	// Function to toggle permission
	function togglePermission(roleId: string, action: PermissionAction) {
		if (!permissionsState[roleId]) {
			permissionsState[roleId] = {} as Record<PermissionAction, boolean>;
		}

		// Don't allow modifying admin permissions
		const role = roles.find((r) => r._id === roleId);
		if (role?.isAdmin) {
			showToast('Cannot modify permissions for admin role', 'warning');
			return;
		}

		permissionsState[roleId][action] = !permissionsState[roleId][action];
		updateParent();
	}

	// Function to update parent
	function updateParent() {
		// Remove roles with all permissions true (default state)
		const cleanedPermissions = Object.entries(permissionsState).reduce<Record<string, Record<PermissionAction, boolean>>>((acc, [roleId, perms]) => {
			const hasRestrictions = Object.values(perms).some((value) => value === false);
			if (hasRestrictions) {
				acc[roleId] = perms;
			}
			return acc;
		}, {});

		onUpdate(cleanedPermissions);
	}

	// Show toast messages
	function showToast(description: string, type: 'success' | 'warning' | 'error') {
		const types: Record<'success' | 'warning' | 'error', 'success' | 'error' | 'info'> = {
			success: 'success',
			warning: 'info', // warning maps to info since it's not available
			error: 'error'
		};
		toast.create({
			description,
			type: types[type],
			duration: 3000
		});
	}

	// Filter roles based on search
	let filteredRoles = $derived(roles.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase())));

	// Icons for different permission actions
	const actionIcons = {
		create: 'bi:plus-circle-fill',
		read: 'bi:eye-fill',
		update: 'bi:pencil-fill',
		delete: 'bi:trash-fill',
		manage: 'bi:gear-fill',
		share: 'bi:share-fill',
		access: 'bi:key-fill',
		execute: 'bi:play-fill'
	};
</script>

{#if error}
	<div class="text-error-500 p-4 text-center" role="alert">
		<p>Error: {error}</p>
		<button onclick={() => (error = null)} class="btn preset-filled-primary-500 mt-2">Dismiss</button>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<div class="flex flex-col justify-between gap-4 sm:flex-row">
			<input bind:value={searchQuery} placeholder="Search roles..." class="input flex-grow" aria-label="Search roles" />
		</div>

		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th scope="col" class="px-4 py-2">Role</th>
						{#each Object.values(PermissionAction) as action}
							<th scope="col" class="px-4 py-2">
								<div class="flex items-center justify-center gap-2">
									<iconify-icon icon={actionIcons[action]} width="18"></iconify-icon>
									{action}
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each filteredRoles as role (role._id)}
						<tr class="border-t">
							<th scope="row" class="px-4 py-2">
								<div class="flex items-center gap-2">
									<span class="font-semibold">{role.name}</span>
									{#if role.isAdmin}
										<span class="preset-filled-primary-500 rounded-sm px-2 py-1 text-xs">Admin</span>
									{/if}
								</div>
								{#if role.description}
									<div class="text-sm text-gray-500">{role.description}</div>
								{/if}
							</th>
							{#each Object.values(PermissionAction) as action}
								<td class="px-4 py-2">
									<button
										onclick={() => togglePermission(role._id, action)}
										disabled={role.isAdmin}
										aria-label={`${permissionsState[role._id]?.[action] ? 'Disable' : 'Enable'} ${action} for ${role.name}`}
										class={`btn ${permissionsState[role._id]?.[action] ? 'preset-filled-success-500' : 'preset-filled-error-500'}`}
									>
										<iconify-icon icon={actionIcons[action]} width="18"></iconify-icon>
									</button>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if filteredRoles.length === 0}
			<p class="text-center text-gray-500">No roles match your search.</p>
		{/if}
	</div>
{/if}
