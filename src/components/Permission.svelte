<script lang="ts">
	// Auth
	import { roles, icon, color } from '@src/auth/types';
	import type { Roles, permissions as Permissions } from '@src/auth/types';

	// Stores
	import { mode } from '@stores/store';

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let permissions = {};

	// Importing the Roles type from types.ts
	type Role = keyof typeof roles;

	// Define the Permissions type
	type Permissions = {
		create: boolean;
		read: boolean;
		write: boolean;
		delete: boolean;
	};

	// Define the Permissions types
	type RolesPermissions = Record<Role, Permissions>;

	// Define the RolesArray type using the Roles type imported from types.ts
	type RolesArray = { name: Roles; permissions: Permissions }[];

	// Initialize rolesArray
	let rolesArray: RolesArray = [];

	$: {
		if ($mode === 'edit') {
			rolesArray = Object.values(roles)
				.filter((role) => role !== 'admin')
				.map((role) => ({
					name: role,
					permissions: permissions[role] || { create: true, read: true, write: true, delete: true } // All permissions set to true initially
				}));
		}
	}

	// Dynamic buttonMap based on data from types.ts
	const buttonMap = Object.entries(icon).reduce((acc, [permission, iconName]) => {
		acc[permission] = {
			disabled: color.disabled[permission],
			enabled: color.enabled[permission],
			icon: iconName,
			color: color[permission],
			toggle: false
		};
		return acc;
	}, {});

	// Define a function to add a new role with default permissions
	function addPermission() {
		const newRole = Object.values(roles).find((role) => !rolesArray.some((r) => r.name === role) && role !== 'admin');
		if (newRole) {
			const initialPermissions: Permissions = { create: false, read: false, write: false, delete: false };
			rolesArray = [...rolesArray, { name: newRole, permissions: initialPermissions }];
		} else {
			console.error('Cannot add a new role when the store is empty');
			const t = {
				message: '<iconify-icon icon="mdi:user" color="white" width="24" class="mr-1"></iconify-icon> All roles have been added.',
				background: 'gradient-tertiary',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	function togglePermission(role: any, permission: string) {
		// Toggle the permission
		role.permissions[permission] = !role.permissions[permission];
		// Update the permission store
		dispatch('update', getMappedPermissions(rolesArray));

		// Update the button map toggle based on the new permission state
		buttonMap[permission].toggle = role.permissions[permission];
	}

	// Function to remove a role permission
	function removeRole(index: number) {
		const roleName = rolesArray[index].name;
		rolesArray = rolesArray.filter((_, i) => i !== index);
		const updatedPermissions = { ...permissions };
		delete updatedPermissions[roleName];
		dispatch('update', getMappedPermissions(rolesArray));
	}

	/// Function to toggle all permissions for a role
	function toggleAllRolePermissions(permission: string) {
		const enable = !rolesArray.every((role) => role.permissions[permission]);
		rolesArray.forEach((role) => {
			role.permissions[permission] = enable;
		});
		// rolesArray = rolesArray.reduce((acc, role) => ({ ...acc, [role.name]: { ...role.permissions } }), {});
		dispatch('update', getMappedPermissions(rolesArray));

		// Update the button map toggle based on the new permission state
		Object.keys(buttonMap).forEach((key) => (buttonMap[key].toggle = enable));
	}

	function getMappedPermissions(rolesArray: RolesArray) {
		const mappedPermissions: RolesPermissions = {} as RolesPermissions;
		rolesArray.forEach((role) => {
			mappedPermissions[role.name as Role] = role.permissions;
		});
		return mappedPermissions;
	}

	let searchQuery = '';

	// Filter roles based on search query
	let filteredRolesArray: typeof rolesArray = [];
	$: {
		filteredRolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}

	// function getTruePermissions(permissions: RolesPermissions): RolesPermissions {
	// 	const truePermissions: RolesPermissions = {} as RolesPermissions;
	// 	Object.keys(permissions).forEach((role) => {
	// 		truePermissions[role as Role] = {} as Permissions;
	// 		Object.keys(permissions[role]).forEach((permission) => {
	// 			if (permissions[role][permission as keyof Permissions]) {
	// 				truePermissions[role as Role][permission as keyof Permissions] = true;
	// 			}
	// 		});
	// 	});
	// 	return truePermissions;
	// }
</script>

<div class="dark mb-2 text-center sm:flex sm:flex-col">
	<div>{m.collection_permission_helper1()}</div>
	<div class="mt-2 flex items-center justify-center space-x-4 divide-x-2 divide-surface-400">
		{#each Object.keys(buttonMap) as permission}
			<span class="text-{buttonMap[permission].color}-500">
				<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1 dark:text-white" />
				{permission.charAt(0).toUpperCase() + permission.slice(1)}
			</span>
		{/each}
	</div>
</div>
<p class="dark mb-2 text-center text-tertiary-500 dark:text-primary-500">{m.collection_permission_admin_helper()}</p>

<div class="mt-4 flex {filteredRolesArray.length > 0 ? 'justify-between' : 'justify-center'}  gap-4">
	{#if filteredRolesArray.length > 0}
		<!-- Search Filter by role -->
		<div class="input-group input-group-divider max-w-sm grid-cols-[auto_1fr_auto]">
			<div class="input-group-shim">
				<iconify-icon icon="material-symbols:search" />
			</div>
			<input bind:value={searchQuery} type="search" placeholder="Search..." />
		</div>
	{/if}

	<!-- Add Permission -->
	{#if Object.keys(permissions).length > 0 || rolesArray.length === 0}
		<button
			on:click={addPermission}
			class="variant-filled-success btn w-full justify-center text-center dark:variant-filled-tertiary sm:w-auto sm:justify-end"
		>
			<iconify-icon icon="material-symbols:add" color="white" width="18" class="mr-1" />
			{m.collection_permission_addpermission()}
		</button>
	{/if}
</div>

{#if filteredRolesArray.length > 0}
	<div class="table-container my-2">
		<table class="table table-hover table-compact">
			<!-- Table Header -->
			<thead>
				<tr class="divide-x divide-surface-400 border-b-2 border-surface-400">
					<th class="bg-white text-center dark:bg-surface-900">{m.collection_permission_roles()}</th>
					{#each Object.keys(buttonMap) as permission}
						<th class="bg-white !p-3 dark:bg-surface-900">
							<button
								class="btn w-full {rolesArray.every((role) => role.permissions[permission])
									? buttonMap[permission].enabled
									: buttonMap[permission].disabled}"
								on:click={() => toggleAllRolePermissions(permission)}
							>
								<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1 sm:hidden md:inline-block"></iconify-icon>
								<span class="hidden sm:inline-block">{permission.charAt(0).toUpperCase() + permission.slice(1)}</span>
							</button>
						</th>
					{/each}
					<th class="bg-white text-center dark:bg-surface-900">
						<iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" />
					</th>
				</tr>
			</thead>

			<!-- Table Body -->
			<tbody>
				{#each filteredRolesArray as role, index (role.name)}
					<tr class="divide-x divide-surface-400 last:border-0">
						<!-- Role Name -->
						<td class="bg-white !p-0 dark:bg-surface-900">
							<select bind:value={role.name} class="input">
								{#each Object.values(roles) as r}
									{#if r !== 'admin'}
										<option value={r} disabled={rolesArray.some((existingRole) => existingRole.name === r && existingRole !== role)}>{r}</option>
									{/if}
								{/each}
							</select>
						</td>

						<!-- Role Permissions -->
						{#if role.permissions && typeof role.permissions === 'object'}
							{#each Object.keys(buttonMap) as permission}
								<td class="bg-white dark:bg-surface-900">
									<button
										class="btn w-full {role.permissions[permission] ? buttonMap[permission].enabled : buttonMap[permission].disabled}"
										on:click={() => togglePermission(role, permission)}
									>
										<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1 sm:hidden md:inline-block"></iconify-icon>
										<span class="hidden sm:inline-block">{permission.charAt(0).toUpperCase() + permission.slice(1)}</span>
									</button>
								</td>
							{/each}
						{/if}

						<!-- Delete Role Button -->
						<td class="bg-white text-center dark:bg-surface-900">
							<button on:click={() => removeRole(index)} class="variant-ghost-surface btn-icon">X</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="mt-4 text-center">
			Permissions: <span class="text-primary-500">{JSON.stringify(permissions, null, 2)}</span>
		</div>
	</div>
{/if}
