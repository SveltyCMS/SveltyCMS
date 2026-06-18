<!--
@file src/routes/(app)/config/access-management/role-modal.svelte
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
import { button_cancel } from "@src/paraglide/messages";
import { modalState } from "@utils/modal.svelte";
import type { SvelteComponent } from "svelte";
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Textarea from '@components/ui/textarea.svelte';

interface Props {
	currentGroupName: string;
	currentRoleId: string;
	isEditMode: boolean;
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

let formName = $state("");
let formDescription = $state("");
let localSelectedPermissions = $state<string[]>([]);
let permSearch = $state("");
let copyFromRoleId = $state("");

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

const copyRoleOptions = $derived(
	roles
		.filter((r) => r._id !== currentRoleId && !r.isAdmin)
		.map((r) => ({ value: r._id, label: r.name }))
);

function togglePermission(id: string) {
	if (localSelectedPermissions.includes(id)) {
		localSelectedPermissions = localSelectedPermissions.filter((p) => p !== id);
	} else {
		localSelectedPermissions = [...localSelectedPermissions, id];
	}
}

function handleCopyPermissions(roleId: string) {
	if (!roleId) return;
	const sourceRole = roles.find((r) => r._id === roleId);
	if (sourceRole) {
		localSelectedPermissions = [...sourceRole.permissions];
	}
	copyFromRoleId = "";
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

<AdminCard class="w-modal space-y-4 p-4 shadow-xl border border-surface-200 dark:border-surface-800">
	<header class="text-center text-2xl font-bold">{isEditMode ? 'Edit Role' : 'Create New Role'}</header>

	<form
		class="modal-form space-y-4 border border-surface-200 dark:border-surface-700 p-4 rounded overflow-y-auto max-h-[60vh]"
		onsubmit={onFormSubmit}
		id="roleForm"
	>
		<Input label="Role Name" bind:value={formName} placeholder="Role Name" required />
		<Textarea
			id="role-description"
			label="Role Description"
			bind:value={formDescription}
			placeholder="Role Description"
			rows={3}
		/>

		<div class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<span class="font-bold">Permissions ({localSelectedPermissions.length})</span>
				<div class="flex gap-2">
					<Select
						bind:value={copyFromRoleId}
						options={copyRoleOptions}
						placeholder="Copy permissions from..."
						size="sm"
						onchange={handleCopyPermissions}
						class="min-w-44"
					/>
					<Input
						bind:value={permSearch}
						placeholder="Search..."
						aria-label="Search permissions"
						class="max-w-37.5"
						inputClass="text-sm h-8"
					/>
				</div>
			</div>

			<div class="card h-48 overflow-y-auto p-2 border border-surface-200 dark:border-surface-700 bg-surface-50/30 dark:bg-surface-900/20">
				{#each filteredPermissions as perm (perm._id)}
					<div class="p-1 hover:bg-surface-50/40 dark:hover:bg-surface-900/30 rounded">
						<Checkbox
							checked={localSelectedPermissions.includes(perm._id)}
							onchange={() => togglePermission(perm._id)}
							label={perm.name}
						/>
					</div>
				{:else}
					<div class="text-center p-4 opacity-50 text-sm">No permissions found</div>
				{/each}
			</div>
		</div>
	</form>

	<footer class="modal-footer flex justify-end gap-4">
		<Button variant="ghost" onclick={parent.onClose}>{button_cancel()}</Button>
		<Button variant="primary" type="submit" form="roleForm">{isEditMode ? 'Update' : 'Create'}</Button>
	</footer>
</AdminCard>