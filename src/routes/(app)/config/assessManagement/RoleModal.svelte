<script lang="ts">
	import type { SvelteComponent } from 'svelte';

	// Stores
	import { writable } from 'svelte/store';
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
	export let availablePermissions = writable<Permission[]>([]);
	export let selectedPermissions = [];

	const modalStore = getModalStore();

	const saveRole = () => {
		if ($modalStore[0].response) {
			$modalStore[0].response({ roleName, roleDescription, currentGroupName, selectedPermissions, currentRoleId });
		}
		modalStore.close();
	};

	const closeModal = () => {
		modalStore.close();
	};

	const togglePermissionSelection = (permissionId: string) => {
		const index = selectedPermissions.findIndex((cur) => cur === permissionId);
		if (index > -1) {
			selectedPermissions.splice(index, 1);
		} else {
			selectedPermissions.push(permissionId);
		}
	};

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class="modal-avatar {cBase}">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>

		<form class="modal-form {cForm}">
			<label class="label">
				<span>Role Name:</span>
				<input type="text" bind:value={roleName} placeholder="Role Name" class="input" />
			</label>

			<label class="label">
				<span>Role Description:</span>
				<textarea bind:value={roleDescription} placeholder="Role Description" class="input"></textarea>
			</label>
		</form>
		<footer class="modal-footer {parent.regionFooter} justify-between">
			<button class="variant-outline-secondary btn" on:click={parent.onClose}>
				{m.button_cancel()}
			</button>
			<button on:click={saveRole} class="variant-filled-primary btn">{isEditMode ? 'Save Changes' : 'Create Role'}</button>
		</footer>
	</div>
{/if}
