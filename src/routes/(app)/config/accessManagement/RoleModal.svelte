<!--
@file src/routes/(app)/config/accessManagement/RoleModal.svelte
@component 
**This component provides a modal for creating and editing roles in the access management system.**

Features:
- Create and edit roles
- Enter role name and description
- Select associated permissions
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	interface Props {
		isEditMode: boolean;
		currentRoleId: string;
		roleName: string;
		roleDescription: string;
		currentGroupName: string;
		selectedPermissions?: string[];
		close?: (data?: any) => void;
	}

	const { isEditMode, currentRoleId, roleName, roleDescription, currentGroupName, selectedPermissions = [], close }: Props = $props();

	// Local form state
	let formName = $state('');
	let formDescription = $state('');

	$effect(() => {
		formName = roleName;
		formDescription = roleDescription;
	});

	function onFormSubmit(event: SubmitEvent): void {
		event.preventDefault();
		close?.({
			roleName: formName,
			roleDescription: formDescription,
			currentGroupName,
			selectedPermissions,
			currentRoleId
		});
	}
</script>

<div class="space-y-4">
	<header class="text-center text-2xl font-bold">
		{isEditMode ? 'Edit Role' : 'Create New Role'}
	</header>

	<form
		class="modal-form space-y-4 border border-surface-500 rounded-xl bg-surface-100 dark:bg-surface-800 p-4"
		onsubmit={onFormSubmit}
		id="roleForm"
	>
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
		<button class="preset-ghost-surface-500 btn" onclick={() => close?.()}>{m.button_cancel()}</button>
		<button type="submit" form="roleForm" class="preset-filled-primary-500 btn">{isEditMode ? 'Update' : 'Create'}</button>
	</footer>
</div>
