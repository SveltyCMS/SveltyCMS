<!--
@file src/routes/(app)/config/adminRoleManagement/AdminRoleManagement.svelte
@description This component manages the selection and updating of the administrator role within the application. 
It provides functionality to:
- Load and display available roles, excluding the current administrator role.
- Allow users to select a new role for the administrator using a dropdown menu.
- Display the current and selected administrator roles.
- Show "Save Changes" and "Cancel" buttons when a new role is selected, and handle the save or cancel operation.
- Provide feedback to the user through notifications after saving changes.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';

	// Types
	import type { Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// State stores
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);
	const currentAdminRole = writable<string | null>(null);
	const currentAdminName = writable<string | null>(null);
	const selectedAdminRole = writable<string | null>(null);
	const hasChanges = writable(false);
	const isSaving = writable(false);
	const notification = writable<string | null>(null);

	// Fetch roles on component mount
	onMount(async () => {
		try {
			await loadRoles(); // Load roles after initialization
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false); // Set loading to false after loading roles
		}
	});

	// Function to load roles from the authAdapter
	const loadRoles = async () => {
		try {
			const rolesData = $page.data.roles;
			const currentAdmin = rolesData.find((role) => role.isAdmin === true);

			if (currentAdmin) {
				currentAdminRole.set(currentAdmin._id); // Set the current admin role
				currentAdminName.set(currentAdmin.name);
				selectedAdminRole.set(currentAdmin._id); // Initially set the selected admin role to the current admin role
				// Remove the current admin role from the dropdown options
				roles.set(rolesData.filter((role) => role._id !== currentAdmin._id));
			} else {
				roles.set(rolesData); // If no current admin role, show all roles
			}
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	// Handle role change
	const handleRoleChange = (event: Event) => {
		const selectedRoleId = (event.target as HTMLSelectElement).value;
		selectedAdminRole.set(selectedRoleId); // Update the selected role in the store
		hasChanges.set(selectedRoleId !== $currentAdminRole); // Check if the selected role is different from the current role
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

	// Function to save the new admin role
	const saveAdminRole = async () => {
		try {
			isSaving.set(true);
			notification.set(null); // Clear any existing notifications

			// Simulate the saving process
			await tick(); // Ensure DOM updates before save process begins
			// Implement the logic to save the new admin role here

			currentAdminRole.set($selectedAdminRole);
			try {
				const response = await fetch('/api/role/admin', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ roleId: $selectedAdminRole })
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
				isLoading.set(true);
				invalidateAll().then(() => {
					isLoading.set(false);
				});
			} catch (error) {
				showToast('Network error occurred while updating config file', 'error');
			}
			hasChanges.set(false);
			notification.set('Admin role updated successfully.');
		} catch (err) {
			notification.set(`Failed to save admin role: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isSaving.set(false);
		}
	};

	// Function to cancel changes and reset the selected role to the current admin role
	const cancelChanges = () => {
		selectedAdminRole.set($currentAdminRole);
		hasChanges.set(false);
	};
</script>

{#if $isLoading}
	<Loading customTopText="Loading Admin Role..." customBottomText="" />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Admin Role Management:</h3>
	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Please select a new role for the administrator from the dropdown below. Your changes will take effect after you click "Save Changes".
	</p>
	<div class="wrapper my-4">
		<!-- Display current admin role-->
		<p class="my-4 text-center lg:text-left">
			Current Admin Role: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{$currentAdminName}</span>
		</p>

		<!-- Dropdown to select admin role -->
		<label for="adminRole" class="block text-sm text-surface-300">Select new Administrator Role:</label>
		<select id="adminRole" class="input" on:change={handleRoleChange} bind:value={$selectedAdminRole}>
			{#each $roles as role}
				<option value={role._id}>{role.name}</option>
			{/each}
		</select>

		<!-- Save and Cancel Buttons -->
		{#if $hasChanges}
			<!-- Display new admin role-->
			<p class="mt-4 text-center lg:text-left">
				Selected Admin Role ID: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{$selectedAdminRole}</span>
			</p>
			<div class="mt-4 flex justify-between">
				<!-- cancel -->
				<button on:click={cancelChanges} class="variant-filled-secondary btn"> Cancel </button>

				<!-- Save -->
				<button on:click={saveAdminRole} class="variant-filled-tertiary btn" disabled={$isSaving}>
					{#if $isSaving}
						Saving...
					{:else}
						Save Changes
					{/if}
				</button>
			</div>
		{/if}

		<!-- Notification Message -->
		{#if $notification}
			<p class="mt-4 text-green-600">{$notification}</p>
		{/if}
	</div>
{/if}
