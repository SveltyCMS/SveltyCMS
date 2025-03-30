<!--
@file src/routes/(app)/config/assessManagement/RoleModal.svelte
@component 
**This component manages roles within the application's access management system**

@example
<Roles />	

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

### Features
- Load and display roles and their associated permissions.
- Allow users to create, edit, and delete roles through a modal interface.
- Allow bulk deletion of selected roles.
- Display a skeleton.dev modal for creating or editing roles with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	// import { createEventDispatcher } from 'svelte'; // Removed
	import type { Permission } from '@src/auth/types';

	// Define the shape of the data passed on submit
	type RoleFormData = {
		roleName: string;
		roleDescription: string;
		currentGroupName: string;
		selectedPermissions: string[];
		currentRoleId: string | null;
	};

	// Props
	interface Props {
		open?: boolean;
		isEditMode: boolean;
		currentRoleId: string | null;
		roleName: string;
		roleDescription: string;
		currentGroupName: string; // Assuming this might be needed later or was intended
		selectedPermissions: string[];
		availablePermissions: Permission[];
		onSubmit: (data: RoleFormData) => void; // Callback prop for submit
		onClose: () => void; // Callback prop for close
	}

	let {
		open = $bindable(),
		isEditMode,
		currentRoleId,
		roleName,
		roleDescription,
		currentGroupName, // Keep prop if needed
		selectedPermissions,
		availablePermissions,
		onSubmit, // Get callbacks from props
		onClose // Get callbacks from props
	}: Props = $props();

	// const dispatch = createEventDispatcher(); // Removed

	// Local form state
	let formName = $state(roleName);
	let formDescription = $state(roleDescription);
	let formPermissions = $state(new Set(selectedPermissions)); // Use a Set for easier handling

	// Effect to reset form state when props change (e.g., opening modal for a different role)
	$effect(() => {
		formName = roleName;
		formDescription = roleDescription;
		formPermissions = new Set(selectedPermissions);
	});

	function handlePermissionChange(permissionId: string, checked: boolean) {
		if (checked) {
			formPermissions.add(permissionId);
		} else {
			formPermissions.delete(permissionId);
		}
		// Trigger reactivity for the Set
		formPermissions = new Set(formPermissions);
	}

	function onFormSubmit(): void {
		const formData = {
			roleName: formName,
			roleDescription: formDescription,
			currentGroupName: currentGroupName, // Pass back if needed
			selectedPermissions: Array.from(formPermissions),
			currentRoleId: currentRoleId // Pass back the ID for editing
		};
		onSubmit(formData); // Call onSubmit prop
		// Parent component will set open = false via binding
	}

	function handleCancel(): void {
		onClose(); // Call onClose prop
		// Parent component will set open = false via binding
	}
</script>

<Modal
	{open}
	onOpenChange={(e) => {
		if (!e.open) {
			onClose(); // Call onClose if closed externally
		}
	}}
	contentBase="card bg-surface-100-900 p-4 md:p-6 space-y-4 shadow-xl max-w-screen-md rounded-lg"
	backdropClasses="backdrop-blur-sm"
>
	<!-- Modal Content -->
	{#snippet content()}
		<header class="border-surface-300-700 flex items-center justify-between border-b pb-4">
			<h2 class="h2">{isEditMode ? 'Edit Role' : 'Create New Role'}</h2>
			<button type="button" class="btn-icon btn-icon-sm variant-soft hover:variant-ghost" aria-label="Close modal" onclick={handleCancel}>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</header>

		<form
			class="space-y-5"
			onsubmit={(e) => {
				e.preventDefault();
				onFormSubmit();
			}}
		>
			<label class="space-y-2">
				<span class="font-medium">Role Name:</span>
				<input type="text" bind:value={formName} placeholder="Enter role name" class="input w-full" required />
			</label>

			<label class="space-y-2">
				<span class="font-medium">Role Description:</span>
				<textarea bind:value={formDescription} placeholder="Optional description" class="textarea w-full" rows="3"></textarea>
			</label>

			<fieldset class="space-y-2">
				<legend class="font-medium">Permissions:</legend>
				<div class="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto rounded border p-2 sm:grid-cols-2 md:grid-cols-3">
					{#each availablePermissions as permission (permission._id)}
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								class="checkbox"
								checked={formPermissions.has(permission._id)}
								onchange={(e) => handlePermissionChange(permission._id, e.currentTarget.checked)}
							/>
							<span>{permission.name}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<!-- Action Buttons -->
			<div class="flex justify-end gap-3 pt-4">
				<button type="button" class="btn variant-soft" onclick={handleCancel}> Cancel </button>
				<button type="submit" class="btn variant-filled-primary"> {isEditMode ? 'Update Role' : 'Create Role'} </button>
			</div>
		</form>
	{/snippet}
</Modal>
