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
	import { tick } from 'svelte';

	// Types
	import type { Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';

	// State stores
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);
	const currentAdminRole = writable<string | null>(null);
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
			const currentAdmin = rolesData.find((role) => role._id.toLowerCase() === 'admin');

			if (currentAdmin) {
				currentAdminRole.set(currentAdmin._id); // Set the current admin role
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

	// Function to save the new admin role
	const saveAdminRole = async () => {
		try {
			isSaving.set(true);
			notification.set(null); // Clear any existing notifications

			// Simulate the saving process
			await tick(); // Ensure DOM updates before save process begins
			// Implement the logic to save the new admin role here

			currentAdminRole.set($selectedAdminRole);
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
	<Loading customTopText="Loading Admin Role..." customBottomText="Please wait while the admin role is being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="my-4">
		<h2 class="text-center text-lg font-semibold lg:text-left">Admin Role Management</h2>
		<p class="mt-1 text-sm text-surface-300">
			Please select a new role for the administrator from the dropdown below. Your changes will take effect after you click "Save Changes".
		</p>

		<!-- Display current admin role-->
		<p class="my-4 text-center lg:text-left">
			Current Admin Role: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{$currentAdminRole}</span>
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
				<button on:click={saveAdminRole} class="variant-filled-tertiary btn" disabled={$isSaving}>
					{#if $isSaving}
						Saving...
					{:else}
						Save Changes
					{/if}
				</button>
				<button on:click={cancelChanges} class="variant-filled-secondary btn"> Cancel </button>
			</div>
		{/if}

		<!-- Notification Message -->
		{#if $notification}
			<p class="mt-4 text-green-600">{$notification}</p>
		{/if}
	</div>
{/if}
