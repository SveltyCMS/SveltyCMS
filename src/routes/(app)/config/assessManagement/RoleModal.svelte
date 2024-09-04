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
	<div class={cBase}>
		<header class={cHeader}>{isEditMode ? 'Edit Role' : 'Add Role'}</header>
		<span> Role Name </span>
		<input type="text" bind:value={roleName} placeholder="Role Name" class="mb-2 w-full rounded border p-2 text-black" />
		<span> Role Description </span>
		<textarea bind:value={roleDescription} placeholder="Role Description" class="mb-2 w-full rounded border p-2 text-black"></textarea>
		<!-- <input type="text" bind:value={currentGroupName} placeholder="Group Name" class="mb-2 w-full rounded border p-2 text-black" /> -->
		<!-- <div class="flex flex-wrap gap-2">
			{#each $availablePermissions as permission (permission._id)}
				<label class="flex items-center">
					<input
						type="checkbox"
						checked={selectedPermissions.findIndex((cur) => cur === permission._id) > -1}
						on:change={() => togglePermissionSelection(permission._id)}
						class="mr-2 text-black"
					/>
					<span>{permission.name}</span>
				</label>
			{/each}
		</div> -->
		<div class="footer flex justify-end gap-4">
			<button on:click={closeModal} class="variant-filled-secondary btn">Cancel</button>
			<button on:click={saveRole} class="variant-filled-primary btn">{isEditMode ? 'Save Changes' : 'Create Role'}</button>
		</div>
	</div>
{/if}
