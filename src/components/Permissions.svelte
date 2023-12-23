<script lang="ts">
	import { permissionStore } from '@stores/store';
	import { roles, type permissions } from '@collections/types';

	import { getToastStore } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();

	type Role = keyof typeof roles;
	type Permission = keyof permissions[Role];

	let rolesArray: {
		name: Role;
		permissions: permissions[Role];
	}[] = [];

	let MorePermissions = true;
	let searchQuery = '';

	function addPermission() {
		const availableRoles = Object.values(roles).filter((role) => !rolesArray.some((r) => r.name === role));
		if (availableRoles.length > 0) {
			const newRole = availableRoles[0]; // Select the first available role
			rolesArray = [...rolesArray, { name: newRole, permissions: { read: false, write: false, delete: false } }];

			MorePermissions = availableRoles.length > 1; // Update MorePermissions
		} else {
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
		rolesArray = rolesArray; // Trigger Svelte reactivity
		MorePermissions = rolesArray.length < Object.keys(roles).length; // Make MorePermissions reactive
	}

	function togglePermission(event: MouseEvent, role: { name: Role; permissions: permissions[Role] }, permission: string) {
		event.stopPropagation();
		if (role && ['read', 'write', 'delete'].includes(permission)) {
			const typedPermission = permission as Permission;
			role.permissions = { ...role.permissions, [typedPermission]: !role.permissions[typedPermission] };
			rolesArray = [...rolesArray]; // Trigger Svelte reactivity
		} else {
			console.error('Role is undefined or permission is invalid');
		}
	}

	function toggleAllPermissions(permission: string) {
		if (['read', 'write', 'delete'].includes(permission)) {
			const typedPermission = permission as Permission;
			const allRolesHavePermission = rolesArray.every((role) => role.permissions[typedPermission]);
			rolesArray.forEach((role) => {
				role.permissions = { ...role.permissions, [typedPermission]: !allRolesHavePermission };
			});
			rolesArray = [...rolesArray]; // Trigger Svelte reactivity
		} else {
			console.error('Invalid permission');
		}
	}

	let permissionHeaders: string[] = [];
	let filteredRolesArray: typeof rolesArray = [];

	$: {
		permissionHeaders = rolesArray.length > 0 ? Object.keys(rolesArray[0].permissions) : [];
		filteredRolesArray = rolesArray.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}
</script>

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
	<div class="table-container mt-2">
		<table class="table table-hover table-compact">
			<thead>
				<tr class="divide-x divide-surface-400 border-b border-surface-400 text-primary-500">
					<th class="text-center">Roles:</th>
					{#each permissionHeaders as permission}
						<th>
							<button class="variant-outline-secondary btn w-full text-center" on:click={() => toggleAllPermissions(permission)}>
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
						<td>
							<!-- todo: hide selected terms -->
							<select bind:value={role.name} class="input">
								{#each Object.values(roles) as r}
									<option disabled={rolesArray.some((r2) => r2.name === r)}>{r}</option>
								{/each}
							</select>
						</td>

						{#each Object.keys(role.permissions) as permission}
							<td>
								<button
									class="btn h-full w-full text-center"
									class:variant-filled-tertiary={role.permissions[permission] && permission === 'read'}
									class:variant-filled-primary={role.permissions[permission] && permission === 'write'}
									class:variant-filled-error={role.permissions[permission] && permission === 'delete'}
									class:variant-filled-surface={!role.permissions[permission]}
									on:click={(event) => togglePermission(event, role, permission)}
								>
									{permission.charAt(0).toUpperCase() + permission.slice(1)}
								</button>
							</td>
						{/each}
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
