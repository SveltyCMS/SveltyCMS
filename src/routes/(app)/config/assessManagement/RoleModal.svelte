<script lang="ts">
	import type { SvelteComponent } from 'svelte';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	// Auth
	import type { Role, Permission } from '@src/auth/types';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	/** Exposes parent props to this component. */
	export let parent: SvelteComponent;
	export let isEditMode: boolean;
	export let currentRoleId: string;
	export let roleName: string;
	export let roleDescription: string;
	export let currentGroupName: string;
	export let selectedPermissions: string[] = [];

	// Local form state
	let formName = roleName;
	let formDescription = roleDescription;

	const modalStore = getModalStore();

	function onFormSubmit(): void {
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

	<form class="modal-form space-y-4 border border-surface-500 p-4 rounded-container-token" on:submit|preventDefault={onFormSubmit}>
		<label class="label">
			<span>Role Name:</span>
			<input type="text" bind:value={formName} placeholder="Role Name" class="input" required />
		</label>

		<label class="label">
			<span>Role Description:</span>
			<textarea bind:value={formDescription} placeholder="Role Description" class="input" rows="3" />
		</label>
	</form>

	<!-- Footer -->
	<footer class="modal-footer flex justify-end gap-4">
		<button class="variant-ghost-surface btn" on:click={parent.onClose}>{m.button_cancel()}</button>
		<button class="variant-filled-primary btn" on:click={onFormSubmit}>{isEditMode ? 'Update' : 'Create'}</button>
	</footer>
</div>
