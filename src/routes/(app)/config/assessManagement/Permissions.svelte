<!--
@file src/routes/(app)/config/assessManagement/Permissions.svelte
@description This component manages permissions in the access management system. It provides functionality to:
- Display existing permissions
- Search and filter permissions
- Modify permission settings, including role assignments
- Bulk delete selected permissions
- Handle advanced permission conditions
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// Stores
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';

	// Auth
	import { authAdapter, initializationPromise } from '@src/databases/db';
	import type { Permission, Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import { PermissionType } from '@root/config/permissions';
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Define writable stores
	const permissionsList = writable<Permission[]>([]);
	const modifiedPermissions = writable<Set<string>>(new Set());
	let searchTerm = '';
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);

	// Reactive statements for filtered permissions and current user ID
	$: filteredPermissions = $permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
	$: groups = getGroups(filteredPermissions);
	$: currentUserId = $page.data.user?._id || '';

	const getGroups = (filteredPermissions) => {
		const groups = [];
		Array.isArray(filteredPermissions) &&
			filteredPermissions.map((cur) => {
				let group;
				if (cur.type === PermissionType.COLLECTION) {
					group = cur._id.split(':')[0];
				} else if (cur.type === PermissionType.USER) {
					group = 'User Management';
				} else if (cur.type === PermissionType.CONFIGURATION) {
					group = 'Configuration';
				}
				if (!groups.includes(group)) {
					groups.push(group);
				}
			});
		return groups;
	};

	const filterGroups = (permissions, group) => {
		if (group === 'User Management') {
			return permissions.filter((cur) => cur.type === PermissionType.USER);
		} else if (group === 'Configuration') {
			return permissions.filter((cur) => cur.type === PermissionType.CONFIGURATION);
		} else {
			return permissions.filter((cur) => cur._id.split(':')[0] === group);
		}
	};

	// Load data on component mount
	onMount(async () => {
		try {
			await loadRoles();
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false);
		}
	});

	// Function to load permissions
	const loadPermissions = async () => {
		try {
			permissionsList.set($page.data.permissions);
		} catch (err) {
			error.set(`Failed to load permissions: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Function to load roles
	const loadRoles = async () => {
		try {
			roles.set($page.data.roles);
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Toggle role assignment for a permission
	const toggleRole = (permission: string, role: string) => {
		roles.update((list) => {
			const index = list.findIndex((cur) => cur._id === role);
			const permissions = list[index].permissions;
			const pIndex = permissions.findIndex((cur) => cur === permission);
			if (pIndex === -1) {
				permissions.push(permission);
			} else {
				permissions.splice(pIndex, 1);
			}
			list.splice(index, 1, { ...list[index], permissions });
			modifiedPermissions.update((per) => {
				per.add(permission);
				return per;
			});
			return list;
		});
	};

	// Save changes to permissions
	const saveChanges = async () => {
		try {
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

				modifiedPermissions.set(new Set());
			} catch (error) {
				showToast('Network error occurred while updating config file', 'error');
			}
			await loadPermissions();
		} catch (err) {
			error.set(`Failed to save changes: ${err instanceof Error ? err.message : String(err)}`);
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

	// Reset changes to permissions
	const resetChanges = () => {
		modifiedPermissions.set(new Set());
	};
</script>

{#if $isLoading}
	<Loading customTopText="Loading Permissions..." customBottomText="Please wait while permissions are being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="wrapper">
		<div class="sticky top-0 z-10 mb-4 flex items-center justify-between">
			<input type="text" bind:value={searchTerm} placeholder="Search permissions..." class="input mr-4 flex-grow" aria-label="Search permissions" />
			<div class="flex space-x-2">
				{#if $modifiedPermissions.size > 0}
					<button on:click={saveChanges} class="variant-filled-tertiary btn">
						Save Changes ({$modifiedPermissions.size})
					</button>
					<button on:click={resetChanges} class="variant-filled-secondary btn">Reset</button>
				{/if}
			</div>
		</div>
		<!-- TODO: Make Titke dynamic -->
		{#if filteredPermissions.length === 0}
			<p class="text-tertiary-500 dark:text-primary-500">
				{searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
			</p>
		{:else}
			<div class="overflow-auto" style="height: calc(100vh - 330px)">
				<table class="compact w-full table-auto border-separate border border-gray-200">
					<thead class="sticky top-0 border border-gray-200 bg-black">
						<tr class="divide-x border-b text-tertiary-500 dark:text-primary-500">
							<th class="px-4 py-2">Type</th>
							<th class="px-4 py-2">Action</th>

							{#each $roles as role}
								{#if role._id !== 'admin'}
									<th class="px-4 py-2">{role.name}</th>
								{/if}
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each groups as group}
							<h5 class=":lg-text-left text-center font-semibold text-tertiary-500 dark:text-primary-500">{group}</h5>
							{#each filterGroups(filteredPermissions, group) as permission}
								<tr class="divide-x">
									<td class="px-4 py-2">{permission._id}</td>
									<td class="px-4 py-2">{permission.action}</td>

									{#each $roles as role}
										{#if role._id !== 'admin'}
											<td class="px-4 py-2 text-center">
												<input
													type="checkbox"
													checked={role.permissions.includes(permission._id)}
													on:change={() => toggleRole(permission._id, role._id)}
													class="form-checkbox"
												/>
											</td>
										{/if}
									{/each}
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}
