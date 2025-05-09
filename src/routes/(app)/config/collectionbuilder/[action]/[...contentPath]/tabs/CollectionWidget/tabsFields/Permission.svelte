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
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	const modalStore = getModalStore();

	// Function to handle permission updates
	function handlePermissionUpdate(event: CustomEvent) {
		targetWidget.update((w) => {
			w.permissions = event.detail;
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
