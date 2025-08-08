<!--
@file src/routes/(app)/config/adminRoleManagement/AdminRole.svelte
@component
**This component manages the selection and updating of the administrator role within the application**

@example
<AdminRole bind:roleData={roleData} />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

It provides functionality to:
- Load and display available roles, excluding the current administrator role.
- Allow users to select a new role for the administrator using a dropdown menu.
- Display the current and selected administrator roles.
- Show "Save Changes" and "Cancel" buttons when a new role is selected, and handle the save or cancel operation.
- Provide feedback to the user through notifications after saving changes.
-->

<script lang="ts">
	import { tick } from 'svelte';

	// Types
	import type { Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();

	let { roleData, setRoleData } = $props();

	// Reactive state 
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let currentAdminRole = $state<string | null>(null);
	let currentAdminName = $state<string | null>(null);
	let selectedAdminRole = $state<string | null>(null);
	let isSaving = $state(false);
	let notification = $state<string | null>(null);

	// Derived state for computed values
	let availableRoles = $derived(roleData.filter((role: Role) => role._id !== currentAdminRole));
	let hasChanges = $derived(selectedAdminRole !== currentAdminRole);

	// Initialize component data
	$effect(() => {
		loadRoles();
	});

	// Function to load roles from the authAdapter
	const loadRoles = async () => {
		try {
			const currentAdmin = roleData.find((role: Role) => role.isAdmin === true);
			if (currentAdmin) {
				currentAdminRole = currentAdmin._id;
				currentAdminName = currentAdmin.name;
				selectedAdminRole = currentAdmin._id;
			}
		} catch (err) {
			error = `Failed to load roles: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isLoading = false;
		}
	};

	// Handle role change
	const handleRoleChange = (event: Event) => {
		const selectedRoleId = (event.target as HTMLSelectElement).value;
		selectedAdminRole = selectedRoleId;
	};

	// Show corresponding Toast messages
	function showToast(message: string, type: 'success' | 'info' | 'error') {
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
			isSaving = true;
			notification = null;

			// Ensure DOM updates before save process begins
			await tick();

			currentAdminRole = selectedAdminRole;
			try {
				const result = roleData.map((cur: Role) => {
					if (cur._id === selectedAdminRole) {
						currentAdminName = cur.name;
						return { ...cur, isAdmin: true };
					}
					if (cur.isAdmin === true) {
						return { ...cur, isAdmin: false };
					}
					return cur;
				});
				setRoleData(result);
			} catch (error) {
				showToast('Network error occurred while updating config file', 'error');
			}
			notification = 'Admin role changed. Click "Save" at the top to apply changes.';
		} catch (err) {
			notification = `Failed to save admin role: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isSaving = false;
		}
	};

	// Function to cancel changes and reset the selected role to the current admin role
	const cancelChanges = () => {
		selectedAdminRole = currentAdminRole;
	};
</script>

{#if isLoading}
	<Loading customTopText="Loading Admin Role..." customBottomText="" />
{:else if error}
	<p class="error">{error}</p>
{:else}
	<h3 class="mb-2 text-center text-xl font-bold">Admin Role Management:</h3>
	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Please select a new role for the administrator from the dropdown below. Your changes will take effect after you click "Save Changes".
	</p>
	<div class="wrapper my-4">
		<!-- Display current admin role-->
		<p class="my-4 text-center lg:text-left">
			Current Admin Role: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{currentAdminName}</span>
		</p>

		<!-- Dropdown to select admin role -->
		<label for="adminRole" class="block text-sm text-surface-300">Select new Administrator Role:</label>
		<select id="adminRole" class="input" onchange={handleRoleChange} bind:value={selectedAdminRole}>
			{#each availableRoles as role}
				<option value={role._id}>{role.name}</option>
			{/each}
		</select>

		<!-- Save and Cancel Buttons -->
		{#if hasChanges}
			<!-- Display new admin role-->
			<p class="mt-4 text-center lg:text-left">
				Selected Admin Role ID: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{selectedAdminRole}</span>
			</p>
			<div class="mt-4 flex justify-between">
				<!-- cancel -->
				<button onclick={cancelChanges} class="variant-filled-secondary btn"> Cancel </button>

				<!-- Save -->
				<button onclick={saveAdminRole} class="variant-filled-tertiary btn" disabled={isSaving}>
					{#if isSaving}
						Saving...
					{:else}
						Save Changes
					{/if}
				</button>
			</div>
		{/if}

		<!-- Notification Message -->
		{#if notification}
			<p class="mt-4 text-green-600">{notification}</p>
		{/if}
	</div>
{/if}
