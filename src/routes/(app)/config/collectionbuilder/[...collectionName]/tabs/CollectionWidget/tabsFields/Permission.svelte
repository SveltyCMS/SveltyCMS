<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/tabs/CollectionWidget/tabsFields/Permission.svelte
@description This component handles permission settings for widget fields.
-->

<script lang="ts">
	// Components
	import PermissionsSetting from '@components/PermissionsSetting.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { targetWidget } from '@stores/collectionStore';

	const modalStore = getModalStore();

	// Function to handle permission updates
	function handlePermissionUpdate(event: CustomEvent) {
		targetWidget.update((w) => {
			w.permissions = event.detail;
			return w;
		});
	}

	// Get roles from the modal store
	$: roles = $modalStore[0]?.value?.roles || [];
</script>

{#if $modalStore[0]}
	<div class="mb-4">
		<PermissionsSetting {roles} permissions={$targetWidget.permissions || {}} on:update={handlePermissionUpdate} />
	</div>
{/if}
