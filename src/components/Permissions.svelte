<script lang="ts">
	import { roles } from '@collections/types';
	import { mode, permissionStore } from '@src/stores/store';

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	type Role = keyof typeof roles;

	type Permissions = {
		create: boolean;
		read: boolean;
		write: boolean;
		delete: boolean;
	};
	type RolesPermissions = Record<Role, Permissions>;

	let rolesArray: {
		name: string;
		permissions: Permissions;
	}[];
	rolesArray = [];

	// Load rolesArray from permissionStore if mode is 'edit'
	$: {
		if ($mode === 'edit') {
			const storedPermissions = $permissionStore;
			rolesArray = Object.values(roles)
				.filter((role) => role !== 'admin')
				.map((role) => ({
					name: role,
					permissions: storedPermissions[role] || { create: false, read: false, write: false, delete: false }
				}));
		}
	}

	// Define a function to get the buttonMap based on a given role and permission
	// function getButtonMap(permission: 'create' | 'read' | 'write' | 'delete') {
	// 	return buttonMap[permission];
	// }

	// Dynamic buttonMap based on data from types.ts
	const buttonMap = {
		create: {
			disabled: 'variant-outline-primary',
			enabled: 'variant-filled-primary',
			icon: 'bi:plus-circle-fill',
			color: 'primary',
			toggle: false
		},
		read: {
			disabled: 'variant-outline-tertiary',
			enabled: 'variant-filled-tertiary',
			icon: 'bi:eye-fill',
			color: 'tertiary',
			toggle: false
		},
		write: {
			disabled: 'variant-outline-warning',
			enabled: 'variant-filled-warning',
			icon: 'bi:pencil-fill',
			color: 'warning',
			toggle: false
		},
		delete: {
			disabled: 'variant-outline-error',
			enabled: 'variant-filled-error',
			icon: 'bi:trash-fill',
			color: 'error',
			toggle: false
		}
	};

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
		permissionStore.update((storeValue) => ({ ...storeValue, [role.name]: { ...role.permissions } }));

		// Update the button map toggle based on the new permission state
		buttonMap[permission].toggle = role.permissions[permission];
	}

	// Function to remove a role permission
	function removeRole(index: number) {
		const roleName = rolesArray[index].name;
		rolesArray = rolesArray.filter((_, i) => i !== index);
		const updatedPermissions = { ...$permissionStore };
		delete updatedPermissions[roleName];

		permissionStore.set(updatedPermissions);
	}

	/// Function to toggle all permissions for a role
	function toggleAllRolePermissions(permission: string) {
		const enable = !rolesArray.every((role) => role.permissions[permission]);
		rolesArray.forEach((role) => {
			role.permissions[permission] = enable;
		});
		permissionStore.set(rolesArray.reduce((acc, role) => ({ ...acc, [role.name]: { ...role.permissions } }), {}));

		// Update the button map toggle based on the new permission state
		Object.keys(buttonMap).forEach((key) => (buttonMap[key].toggle = enable));
	}

	let searchQuery = '';

	// Filter roles based on search query
	let filteredRolesArray: typeof rolesArray = [];
	$: {
		filteredRolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}

	function getTruePermissions(permissions: RolesPermissions): RolesPermissions {
		const truePermissions: RolesPermissions = {} as RolesPermissions;
		Object.keys(permissions).forEach((role) => {
			truePermissions[role as Role] = {} as Permissions;
			Object.keys(permissions[role]).forEach((permission) => {
				if (permissions[role][permission as keyof Permissions]) {
					truePermissions[role as Role][permission as keyof Permissions] = true;
				}
			});
		});
		return truePermissions;
	}
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
	{#if Object.keys(permissionStore).length > 0}
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
		<!-- <div class="mt-4 text-center">
			Permissions: <span class="text-primary-500">{JSON.stringify($permissionStore, null, 2)}</span>
		</div> -->
	</div>
{/if}
