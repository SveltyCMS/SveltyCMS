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
	import { page } from '$app/state';
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<string, boolean>>) {
		const w = targetWidget.value;
		if (!w) return;
		w.permissions = updatedPermissions;
		targetWidget.value = w;
	}

	// Get roles from the modal store
	// Get roles from the page data
	const roles = $derived(page.data?.roles || []);
</script>

{#if targetWidget.value}
	<div class="mb-4">
		<PermissionsSetting {roles} permissions={targetWidget.value.permissions || {}} onUpdate={handlePermissionUpdate} />
	</div>
{/if}
