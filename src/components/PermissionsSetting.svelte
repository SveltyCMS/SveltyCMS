<!--
@file src/components/PermissionsSetting.svelte
@component

@example
<PermissionsSetting />

####	Props:
- `permissions` {object} - The current permissions object
- `on:update` {function} - A function to update the permissions object

Features:
- Shows admin role info separately
- Bulk permission actions
- Permission presets
-->

<script lang="ts">
	import type { Role } from '@src/databases/auth/types';
	import { PermissionAction } from '@src/databases/auth/types';
	// SECURITY: Never import privateEnv in .svelte files - it exposes secrets to client!
	// Use page.data from +page.server.ts instead
	import { toaster } from '@stores/store.svelte';

	interface Props {
		permissions?: Record<string, Record<string, boolean>>;
		roles?: Role[];
		onUpdate?: (permissions: Record<string, Record<string, boolean>>) => void;
	}

	const { permissions = {}, roles = [], onUpdate = () => {} }: Props = $props();

	// Local state
	let error: string | null = $state(null);
	let searchQuery = $state('');

	// Convert permissions object to include all roles with default values
	function initializePermissions(
		currentPermissions: Record<string, Record<string, boolean>>,
		availableRoles: Role[]
	): Record<string, Record<string, boolean>> {
		const initializedPermissions: Record<string, Record<string, boolean>> = { ...currentPermissions };

		// Ensure all roles from the prop have entries
		availableRoles.forEach((role) => {
			if (!initializedPermissions[role._id]) {
				initializedPermissions[role._id] = {
					create: true,
					read: true,
					update: true,
					delete: true,
					manage: true,
					access: true,
					execute: true,
					share: true
				};
			}
		});

		return initializedPermissions;
	}

	// svelte-ignore state_referenced_locally
	let permissionsState: Record<string, Record<string, boolean>> = $state(initializePermissions(permissions, roles));

	// Re-initialize when props change

	$effect(() => {
		permissionsState = initializePermissions(permissions, roles);
	}); // Function to toggle permission

	function togglePermission(roleId: string, action: PermissionAction) {
		if (!permissionsState[roleId]) {
			permissionsState[roleId] = {} as Record<string, boolean>;
		}

		// Don't allow modifying admin permissions
		const role = roles.find((r: Role) => r._id === roleId);
		if (role?.isAdmin) {
			toaster.warning({ description: 'Cannot modify permissions for admin role' });
			return;
		}

		permissionsState[roleId][action] = !permissionsState[roleId][action];
		updateParent();
	}

	// Function to update parent
	function updateParent() {
		// Remove roles with all permissions true (default state)
		const cleanedPermissions = Object.entries(permissionsState).reduce(
			(acc, [roleId, perms]) => {
				const hasRestrictions = Object.values(perms).some((value) => value === false);
				if (hasRestrictions) {
					acc[roleId] = perms;
				}
				return acc;
			},
			{} as Record<string, Record<string, boolean>>
		);

		onUpdate(cleanedPermissions);
	}

	// Filter roles based on search
	const filteredRoles = $derived(roles.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase())));

	// Icons for different permission actions
	const actionIcons: Record<PermissionAction, string> = {
		[PermissionAction.CREATE]: 'bi:plus-circle-fill',
		[PermissionAction.READ]: 'bi:eye-fill',
		[PermissionAction.WRITE]: 'bi:pencil-square',
		[PermissionAction.UPDATE]: 'bi:pencil-fill',
		[PermissionAction.DELETE]: 'bi:trash-fill',
		[PermissionAction.MANAGE]: 'bi:gear-fill',
		[PermissionAction.ACCESS]: 'bi:key-fill',
		[PermissionAction.EXECUTE]: 'bi:play-fill',
		[PermissionAction.SHARE]: 'bi:share-fill'
	};
</script>

{#if error}
	<div class="p-4 text-center text-error-500" role="alert">
		<p>Error: {error}</p>
		<button onclick={() => (error = null)} class="preset-filled-primary-500 btn mt-2">Dismiss</button>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<div class="flex flex-col justify-between gap-4 sm:flex-row">
			<input bind:value={searchQuery} placeholder="Search roles..." class="input grow" aria-label="Search roles" />
		</div>

		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th scope="col" class="px-4 py-2">Role</th>
						{#each Object.values(PermissionAction) as action (action)}
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
										<span class="preset-filled-primary-500 badge">Admin</span>
									{/if}
								</div>
								{#if role.description}
									<div class="text-sm text-gray-500">{role.description}</div>
								{/if}
							</th>
							{#each Object.values(PermissionAction) as action (action)}
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
