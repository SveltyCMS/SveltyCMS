<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Permission.svelte
@component
**This component handles permission settings for widget fields**

Features:
- Permissions settings

-->

<script lang="ts">
	// Components
	import PermissionsSetting from '@cms/components/PermissionsSetting.svelte';
	// Skeleton Stores
	import { modalState } from '@shared/utils/modalState.svelte';
	import { collections } from '@shared/stores/collectionStore.svelte';

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<string, boolean>>) {
		const w = collections.targetWidget;
		if (!w) return;
		w.permissions = updatedPermissions;
		collections.setTargetWidget(w);
	}

	// Get roles from the modal props
	const roles = $derived(modalState.active?.props?.value?.roles || []);
</script>

{#if modalState.active}
	<div class="mb-4">
		<PermissionsSetting {roles} permissions={collections.targetWidget.permissions || {}} onUpdate={handlePermissionUpdate} />
	</div>
{/if}
