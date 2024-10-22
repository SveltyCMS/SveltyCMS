<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/tabs/CollectionWidget/tabsFields/Permission.svelte
@description This component displays the permission tab fields.
-->

<script lang="ts">
	import { page } from '$app/stores';

	// Components
	import PermissionsSetting from '@components/PermissionsSetting.svelte';

	// Stores
	import { targetWidget } from '@stores/collectionStore';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Function to handle permission updates
	function handlePermissionUpdate(event: CustomEvent) {
		targetWidget.update((w) => {
			w.permissions = event.detail;
			return w;
		});
	}
</script>

{#if $modalStore[0]}
	<PermissionsSetting roles={$page.data.roles} permissions={$targetWidget['permissions']} on:update={handlePermissionUpdate} />
{/if}
