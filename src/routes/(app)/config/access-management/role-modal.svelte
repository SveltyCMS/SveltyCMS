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
// Stores

import { button_cancel } from "@src/paraglide/messages";
import { modalState } from "@utils/modal-state.svelte";
import type { SvelteComponent } from "svelte";

// Props
interface Props {
	currentGroupName: string;
	currentRoleId: string;
	isEditMode: boolean;
	/** Exposes parent props to this component. */
	parent: SvelteComponent;
	roleDescription: string;
	roleName: string;
	selectedPermissions?: string[];
	permissions?: import("@src/databases/auth/types").Permission[];
	roles?: import("@src/databases/auth/types").Role[];
}

const {
	parent,
	isEditMode,
	currentRoleId,
	roleName,
	roleDescription,
	currentGroupName,
	selectedPermissions = [],
	permissions = [],
	roles = [],
}: Props = $props();

// Local form state
let formName = $state("");
let formDescription = $state("");
let localSelectedPermissions = $state<string[]>([]);
let permSearch = $state("");

$effect(() => {
	formName = roleName;
	formDescription = roleDescription;
	localSelectedPermissions = [...selectedPermissions];
});

const filteredPermissions = $derived(
	permissions.filter(
		(p) =>
			p.name.toLowerCase().includes(permSearch.toLowerCase()) ||
			p._id.toLowerCase().includes(permSearch.toLowerCase()),
	),
);

function togglePermission(id: string) {
	if (localSelectedPermissions.includes(id)) {
		localSelectedPermissions = localSelectedPermissions.filter((p) => p !== id);
	} else {
		localSelectedPermissions = [...localSelectedPermissions, id];
	}
}

function handleCopyPermissions(event: Event) {
	const targetId = (event.target as HTMLSelectElement).value;
	if (!targetId) return;

	const sourceRole = roles.find((r) => r._id === targetId);
	if (sourceRole) {
		localSelectedPermissions = [...sourceRole.permissions];
	}
	// Reset the select element to "Copy permissions from..."
	(event.target as HTMLSelectElement).value = "";
}

function onFormSubmit(event: SubmitEvent): void {
	event.preventDefault();

	modalState.close({
		roleName: formName,
		roleDescription: formDescription,
		currentGroupName,
		selectedPermissions: localSelectedPermissions,
		currentRoleId,
	});
}
</script>

<div class="card w-modal space-y-4 p-4 shadow-xl">
	<header class="text-center text-2xl font-bold">{isEditMode ? 'Edit Role' : 'Create New Role'}</header>

	<form
		class="modal-form space-y-4 border border-surface-500 p-4 rounded-container-token overflow-y-auto max-h-[60vh]"
		onsubmit={onFormSubmit}
		id="roleForm"
	>
		<label class="label">
			<span>Role Name:</span>
			<input type="text" bind:value={formName} placeholder="Role Name" class="input" required aria-label="Role Name" />
		</label>

		<label class="label">
			<span>Role Description:</span>
			<textarea bind:value={formDescription} placeholder="Role Description" class="input" rows="3" aria-label="Role Description"></textarea>
		</label>

		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="font-bold">Permissions ({localSelectedPermissions.length})</span>
				<div class="flex gap-2">
					<select class="select select-sm" onchange={handleCopyPermissions} aria-label="Copy permissions from another role">
						<option value="">Copy permissions from...</option>
						{#each roles as r}
							{#if r._id !== currentRoleId && !r.isAdmin}
								<option value={r._id}>{r.name}</option>
							{/if}
						{/each}
					</select>
					<input type="text" bind:value={permSearch} placeholder="Search..." class="input input-sm max-w-[150px]" aria-label="Search permissions" />
				</div>
			</div>

			<div class="card h-48 overflow-y-auto p-2 variant-soft">
				{#each filteredPermissions as perm (perm._id)}
					<label class="flex items-center space-x-2 p-1 hover:bg-surface-hover rounded cursor-pointer">
						<input
							type="checkbox"
							class="checkbox"
							checked={localSelectedPermissions.includes(perm._id)}
							onchange={() => togglePermission(perm._id)}
						/>
						<span class="text-sm">{perm.name}</span>
					</label>
				{:else}
					<div class="text-center p-4 opacity-50 text-sm">No permissions found</div>
				{/each}
			</div>
		</div>
	</form>

	<!-- Footer -->
	<footer class="modal-footer flex justify-end gap-4">
		<button class="btn variant-ghost-surface" onclick={parent.onClose}>{button_cancel()}</button>
		<button type="submit" form="roleForm" class="btn variant-filled-primary">{isEditMode ? 'Update' : 'Create'}</button>
	</footer>
</div>
