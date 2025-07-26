<!--
@file src/routes/(app)/config/assessManagement/RoleModal.svelte
@component 
**This component provides a modal for creating and editing roles in the access management system. It allows users to enter role name, description, and select associated permissions.**

@example
<RoleModal />

### Props
- `isEditMode`: A boolean indicating whether the modal is in edit mode
- `currentRoleId`: The ID of the role being edited
- `roleName`: The name of the role being edited
- `roleDescription`: The description of the role being edited
- `currentGroupName`: The group name of the role being edited
- `selectedPermissions`: An array of permission IDs associated with the role

### Features
- Displays a modal for creating or editing a role
- Allows users to enter role name, description, and select associated permissions
- Handles form submission and updates the role data accordingly
-->

<script lang="ts">
	import type { SvelteComponent } from 'svelte';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	interface Props {
		/** Exposes parent props to this component. */
		parent: SvelteComponent;
		isEditMode: boolean;
		currentRoleId: string;
		roleName: string;
		roleDescription: string;
		currentGroupName: string;
		selectedPermissions?: string[];
	}

	let { parent, isEditMode, currentRoleId, roleName, roleDescription, currentGroupName, selectedPermissions = [] }: Props = $props();

	// Local form state
	let formName = $state(roleName);
	let formDescription = $state(roleDescription);

	const modalStore = getModalStore();

	function onFormSubmit(event: SubmitEvent): void {
		event.preventDefault();
		const modal = $modalStore[0];
		if (modal?.response) {
			modal.response({
				roleName: formName,
				roleDescription: formDescription,
				currentGroupName,
				selectedPermissions,
				currentRoleId
			});
		}
		modalStore.close();
	}
</script>

<div class="card w-modal space-y-4 p-4 shadow-xl">
	<header class="text-center text-2xl font-bold">
		{isEditMode ? 'Edit Role' : 'Create New Role'}
	</header>

	<form class="modal-form space-y-4 border border-surface-500 p-4 rounded-container-token" onsubmit={onFormSubmit} id="roleForm">
		<label class="label">
			<span>Role Name:</span>
			<input type="text" bind:value={formName} placeholder="Role Name" class="input" required />
		</label>

		<label class="label">
			<span>Role Description:</span>
			<textarea bind:value={formDescription} placeholder="Role Description" class="input" rows="3"></textarea>
		</label>
	</form>

	<!-- Footer -->
	<footer class="modal-footer flex justify-end gap-4">
		<button class="variant-ghost-surface btn" onclick={parent.onClose}>{m.button_cancel()}</button>
		<button type="submit" form="roleForm" class="variant-filled-primary btn">{isEditMode ? 'Update' : 'Create'}</button>
	</footer>
</div>
