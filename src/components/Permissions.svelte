<script lang="ts">
	import { roles, type permissions } from '@collections/types';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { permissionStore } from '@src/stores/store';

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

	const buttonMap = {
		create: {
			enabled: 'filled-primary',
			disabled: 'outline-primary',
			icon: 'bi:plus-circle-fill',
			color: 'primary'
			// icon: permissions.create.icon.create,
			// color: permissions.create.color.create
		},
		read: {
			enabled: 'filled-tertiary',
			disabled: 'outline-tertiary',
			icon: 'bi:eye-fill',
			color: 'tertiary'
			// icon: permissions.read.icon.read,
			// color: permissions.read.color.read
		},
		write: {
			enabled: 'filled-warning',
			disabled: 'outline-warning',
			icon: 'bi:pencil-fill',
			color: 'warning'
			// icon: permissions.write.icon.write,
			// color: permissions.write.color.write
		},
		delete: {
			enabled: 'filled-error',
			disabled: 'outline-error',
			icon: 'bi:trash-fill',
			color: 'error'
			// icon: permissions.delete.icon.delete,
			// color: permissions.delete.color.delete
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
		rolesArray.splice(index, 1);
		rolesArray = rolesArray;
		MorePermissions = true;
	}

	function togglePermission(event: MouseEvent, role: { name: Role; permissions: permissions[Role] }, permission: string, index: number) {
		event.stopPropagation();
		if (role && role.permissions && permission in role.permissions) {
			const typedPermission = permission as Permission;
			role.permissions = { ...role.permissions, [typedPermission]: !role.permissions[typedPermission] };
			rolesArray = [...rolesArray];
		} else {
			console.error('Role or role.permissions is undefined');
		}
	}

	function toggleAllPermissions(permission: string) {
		const typedPermission = permission as Permission;
		const allRolesHavePermission = rolesArray.every((role) => role.permissions?.[typedPermission]);

		if (allRolesHavePermission !== undefined) {
			rolesArray.forEach((role) => {
				role.permissions = { ...role.permissions, [typedPermission]: !allRolesHavePermission };
			});

			rolesArray = [...rolesArray];
		} else {
			console.error('Role or role.permissions is undefined');
		}
	}

	let permissionHeaders: string[] = [];
	let filteredRolesArray: typeof rolesArray = [];

	$: {
		permissionHeaders = rolesArray.length > 0 ? Object.keys(rolesArray[0].permissions) : [];
		filteredRolesArray = rolesArray.filter((role: (typeof rolesArray)[0]) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}

	// output the selected Permission setting
	$: {
		let truePermissions = {};
		rolesArray.forEach(({ name, permissions }) => {
			Object.entries(permissions).forEach(([key, value]) => {
				if (value === true) {
					if (!truePermissions[name]) {
						truePermissions[name] = {};
					}
					truePermissions[name][key] = value;
				}
			});
		});

		// Update the permissionStore with the new permissions
		permissionStore.set(truePermissions);

		console.log('permissions:', JSON.stringify(truePermissions));
	}
</script>

<p class="dark mb-2 text-center">
	Define User Permissions to
	<span class="text-primary-500">create</span> /
	<span class="text-tertiary-500">read</span> /
	<span class="text-warning-500">write</span> /
	<span class="text-error-500">delete</span> this collection.
</p>
<p class="dark mb-2 text-center text-primary-500">Admin User has all permissions</p>

<div class="mt-4 flex justify-between gap-4">
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
		<button on:click={addPermission} class="variant-filled-tertiary btn w-full justify-end text-center sm:w-auto">
			<iconify-icon icon="material-symbols:add" color="white" width="18" class="mr-1" />
			Add Permissions</button
		>
	{/if}
</div>
{#if filteredRolesArray.length > 0}
	<div class="table-container my-2">
		<table class="table table-hover table-compact">
			<thead>
				<tr class="divide-x divide-surface-400 border-b border-surface-400">
					<th class=" text-center">Roles:</th>
					{#each permissionHeaders as permission}
						<th class="!p-3">
							<button
								class={`variant-${buttonMap[permission].disabled} btn w-full text-center `}
								class:toggle={`variant-${buttonMap[permission].enabled}`}
								on:click={() => toggleAllPermissions(permission)}
							>
								<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1"></iconify-icon>
								{permission.charAt(0).toUpperCase() + permission.slice(1)}
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
										class={`variant-${buttonMap[permission].disabled} btn w-full text-center `}
										class:toggle={`variant-${buttonMap[permission].enabled}`}
										on:click={(event) => {
											togglePermission(event, role, permission, index);
										}}
									>
										<iconify-icon icon={buttonMap[permission].icon} width="16" class="mr-1"></iconify-icon>
										{permission.charAt(0).toUpperCase() + permission.slice(1)}
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
	</div>
{/if}
