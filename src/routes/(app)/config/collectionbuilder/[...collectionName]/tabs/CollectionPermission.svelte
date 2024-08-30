<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/tabs/CollectionPermission.svelte
@description This component displays the collection permission.
-->

<script lang="ts">
	// Stores
	import { collectionValue, tabSet } from '@stores/store';

	// Components
	import PermissionsSetting from '@src/components/PermissionsSetting.svelte';

	async function handlePermissionUpdate(event) {
		collectionValue.update((collection) => {
			collection.permissions = event.detail;
			return collection;
		});
	}
</script>

<!-- Permissions -->
<PermissionsSetting permissions={$collectionValue.permissions} on:update={handlePermissionUpdate} />

<!-- Buttons Previous/Next-->
<div class="flex justify-between">
	<button type="button" on:click={() => ($tabSet = 0)} class="variant-filled-secondary btn mt-2 justify-end">Previous</button>
	<button type="button" on:click={() => ($tabSet = 2)} class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary">Next</button>
</div>
