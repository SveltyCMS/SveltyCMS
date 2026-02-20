<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Permission.svelte
@component
**This component handles permission settings for widget fields**

Features:
- Permissions settings

-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	// Skeleton Stores
	import { modalState } from '@utils/modal-state.svelte';

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<string, boolean>>) {
		const w = collections.targetWidget;
		if (!w) {
			return;
		}
		w.permissions = updatedPermissions;
		collections.setTargetWidget(w);
	}

	// Get roles from the modal props
	const roles = $derived(modalState.active?.props?.value?.roles || []);
</script>

{#if modalState.active}
	<div class="mb-4"><PermissionsSetting {roles} permissions={collections.targetWidget.permissions || {}} onUpdate={handlePermissionUpdate} /></div>
{/if}
