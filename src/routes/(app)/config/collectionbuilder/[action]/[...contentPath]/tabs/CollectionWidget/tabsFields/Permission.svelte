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
	import type { PermissionAction } from '@src/databases/auth/types';
	// Skeleton Stores
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	const modalStore = getModalStore();

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<PermissionAction, boolean>>) {
		targetWidget.update((w) => {
			if (!w) return w;
			w.permissions = updatedPermissions;
			return w;
		});
	}

	// Get roles from the modal store
	let roles = $derived($modalStore[0]?.value?.roles || []);
</script>

{#if $modalStore[0]}
	<div class="mb-4">
		<PermissionsSetting {roles} permissions={targetWidget.value.permissions || {}} onUpdate={handlePermissionUpdate} />
	</div>
{/if}
