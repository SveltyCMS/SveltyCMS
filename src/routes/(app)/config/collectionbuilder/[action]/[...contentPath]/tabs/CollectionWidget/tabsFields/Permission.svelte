<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Permission.svelte
@component
**This component handles permission settings for widget fields**

Features:
- Permissions settings

-->

<script lang="ts">
	// Components
	import PermissionsSetting from '@components/PermissionsSetting.svelte';
	// Skeleton Stores
	import { getModalStore } from '@utils/modalState.svelte';
	import { collections } from '@src/stores/collectionStore.svelte';

	const modalStore = getModalStore();

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<string, boolean>>) {
		const w = collections.targetWidget;
		if (!w) return;
		w.permissions = updatedPermissions;
		collections.setTargetWidget(w);
	}

	// Get roles from the modal store
	const roles = $derived($modalStore[0]?.value?.roles || []);
</script>

{#if $modalStore[0]}
	<div class="mb-4">
		<PermissionsSetting {roles} permissions={collections.targetWidget.permissions || {}} onUpdate={handlePermissionUpdate} />
	</div>
{/if}
