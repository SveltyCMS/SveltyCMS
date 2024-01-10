<script lang="ts">
	import { roles, type permissions } from '@collections/types';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { permissionStore } from '@src/stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	type Role = keyof typeof roles;
	type Permission = keyof permissions[Role];

	let rolesArray: {
		name: Role;
		permissions: permissions[Role];
	}[] = [];

	const toastStore = getToastStore();
	let MorePermissions = true;
	let searchQuery = '';

	// Define a function to get the buttonMap based on a given role and permission
	function getButtonMap(role: Role, permission: Permission) {
		return buttonMap[permission];
	}

	// TODO: Use Dynamic buttonMap to get data from types.ts
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

	function addPermission() {
		if (MorePermissions) {
			const newRole = Object.values(roles).find((role) => !rolesArray.some((r) => r.name === role) && role !== 'admin');

			if (newRole) {
				const initialPermissions: permissions[Role] = { create: false, read: false, write: false, delete: false };
				rolesArray = [...rolesArray, { name: newRole, permissions: initialPermissions }];
			}

			MorePermissions = Object.values(roles).filter((role) => !rolesArray.some((r) => r.name === role) && role !== 'admin').length > 0;
		} else {
			console.error('No more roles available');
			// Trigger the toast
			const t = {
				message: '<iconify-icon icon="mdi:user" color="white" width="24" class="mr-1"></iconify-icon> All roles have been added.',
				// Provide any utility or variant background style:
				background: 'gradient-tertiary',
				timeout: 3000,
				// Add your custom classes here:
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
			MorePermissions = false;
		}
	}

	function removeRole(index: number) {
		rolesArray = rolesArray.filter((_, i) => i !== index);
		MorePermissions = true;
	}

	function togglePermission(event: MouseEvent, role: { name: Role; permissions: permissions[Role] }, permission: string, index: number) {
		event.stopPropagation();

		if (role && role.permissions && permission in role.permissions) {
			const typedPermission = permission as Permission;
			const buttonInfo = getButtonMap(role.name, typedPermission);

			console.log('Role:', role);
			console.log('Permission:', permission);
			console.log('Button Info:', buttonInfo);

			if (buttonInfo) {
				// Update the role's permission
				role.permissions = { ...role.permissions, [typedPermission]: !role.permissions[typedPermission] };

				// Update the button map toggle based on the new permission state
				buttonMap[permission].toggle = role.permissions[typedPermission];

				// Update the roles array
				rolesArray = [...rolesArray];
			} else {
				console.error('Button information not found for the permission:', permission);
			}
		} else {
			console.error('Role or role.permissions is undefined');
		}
	}

	function toggleAllPermissions(permission: string) {
		const typedPermission = permission as Permission;
		const allRolesHavePermission = rolesArray.every((role) => role.permissions?.[typedPermission]);

		if (allRolesHavePermission !== undefined) {
			rolesArray.forEach((role) => {
				const buttonInfo = getButtonMap(role.name, typedPermission);
				if (buttonInfo) {
					// Update the role's permission
					role.permissions = { ...role.permissions, [typedPermission]: !allRolesHavePermission };

					// Update the button map
					buttonMap[permission].toggle = !allRolesHavePermission;
				} else {
					console.error('Button information not found for the permission:', permission);
				}
			});

			// Update the roles array
			rolesArray = [...rolesArray];
		} else {
			console.error('Role or role.permissions is undefined');
		}
	}

	let permissionHeaders: string[] = [];
	let filteredRolesArray: typeof rolesArray = [];

	$: {
		if (rolesArray.length > 0 && rolesArray[0].permissions) {
			permissionHeaders = Object.keys(rolesArray[0].permissions);
		} else {
			permissionHeaders = [];
		}
	}

	$: {
		filteredRolesArray = rolesArray.filter((role: (typeof rolesArray)[0]) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}

	// output the selected Permission setting
	$: {
		let truePermissions = {};
		rolesArray.forEach(({ name, permissions }) => {
			if (permissions) {
				Object.entries(permissions).forEach(([key, value]) => {
					if (value === true) {
						if (!truePermissions[name]) {
							truePermissions[name] = {};
						}
						truePermissions[name][key] = value;
					}
				});
			}
		});

		// Update the permissionStore with the new permissions
		permissionStore.set(truePermissions);

		console.log('permissions:', JSON.stringify(truePermissions));
	}
</script>

<div class="dark mb-2 text-center sm:flex sm:flex-col">
	<div>
		{m.collection_Permission_helper1()}
	</div>
	<div class="mt-2 flex items-center justify-center space-x-4 divide-x-2 divide-surface-400">
		<span class="text-primary-500">
			<iconify-icon icon={buttonMap.create.icon} width="16" class="mr-1 dark:text-white" />
			Create
		</span>

		<span class="text-tertiary-500">
			<iconify-icon icon={buttonMap.read.icon} width="16" class="mx-1 dark:text-white" />
			Read
		</span>

		<span class="text-warning-500">
			<iconify-icon icon={buttonMap.write.icon} width="16" class="mx-1 dark:text-white" />
			Write
		</span>

		<span class="text-error-500">
			<iconify-icon icon={buttonMap.delete.icon} width="16" class="mx-1 dark:text-white" />
			Delete
		</span>
	</div>
</div>
<p class="dark mb-2 text-center text-primary-500">
	{m.collection_permission_admin_helper()}
</p>

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
	{#if MorePermissions}
		<button on:click={addPermission} class="variant-filled-tertiary btn w-full justify-center text-center sm:w-auto sm:justify-end">
			<iconify-icon icon="material-symbols:add" color="white" width="18" class="mr-1" />
			{m.collection_permission_addpermission()}</button
		>
	{/if}
</div>
{#if filteredRolesArray.length > 0}
	<div class="table-container my-2">
		<table class="table table-hover table-compact">
			<thead>
				<tr class="divide-x divide-surface-400 border-b border-surface-400">
					<th class=" text-center">{m.collection_permission_roles()}</th>
					{#each permissionHeaders as permission}
						<th class="!p-3">
							<button
								class="btn w-full {buttonMap[permission].toggle ? buttonMap[permission].enabled : buttonMap[permission].disabled}"
								on:click={() => toggleAllPermissions(permission)}
							>
								<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1 sm:hidden md:inline-block"></iconify-icon>
								<span class="hidden sm:inline-block">{permission.charAt(0).toUpperCase() + permission.slice(1)}</span>
								<!--{buttonMap[permission].toggle}-->
							</button>
						</th>
					{/each}
					<th class="text-center">
						<iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" />
					</th>
				</tr>
			</thead>

			<tbody>
				{#each filteredRolesArray as role, index (role.name)}
					<tr class="divide-x divide-surface-400">
						<!-- Header -->
						<td class="!p-0">
							<select bind:value={role.name} class="input">
								{#each Object.values(roles) as r}
									{#if r !== 'admin'}
										<option value={r} disabled={rolesArray.some((r2) => r2.name === r)}>{r}</option>
									{/if}
								{/each}
							</select>
						</td>
						<!-- Check if the role has permissions and they are of type object -->
						{#if role.permissions && typeof role.permissions === 'object'}
							<!-- Loop over each permission of the role -->
							{#each Object.keys(role.permissions) as permission}
								<!-- Check if the permission exists in the role's permissions -->
								<td>
									<button
										class="btn w-full {buttonMap[permission].toggle ? buttonMap[permission].enabled : buttonMap[permission].disabled}"
										on:click={(event) => {
											togglePermission(event, role, permission, index);
										}}
									>
										<iconify-icon icon={buttonMap[permission]?.icon} width="16" class="mr-1 sm:hidden md:inline-block"></iconify-icon>
										<span class="hidden sm:inline-block">{permission.charAt(0).toUpperCase() + permission.slice(1)}</span>
										<!--{buttonMap[permission].toggle}-->
									</button>
								</td>
							{/each}
						{/if}

						<!--Delete -->
						<td class="text-center">
							<button on:click={() => removeRole(index)} class="variant-ghost-surface btn-icon">X</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="mt-4 text-center">
			Permissions: <span class="text-primary-500">{JSON.stringify($permissionStore, null, 2)}</span>
		</div>
	</div>
{/if}
