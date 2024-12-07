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

	<form class="modal-form space-y-4 border border-surface-500 p-4 rounded-container-token" onsubmit={onFormSubmit}>
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
