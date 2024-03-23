<script lang="ts">
	// Stores
	import { collectionValue, tabSet } from '@stores/store';

	// Components
	import Permissions from '@src/components/Permissions.svelte';

	async function handlePermissionUpdate(event) {
		collectionValue.update((collection) => {
			collection.permissions = event.detail;
			return collection;
		});
	}
</script>

<!-- Permissions -->
<Permissions permissions={$collectionValue.permissions} on:update={handlePermissionUpdate} />

<!-- Buttons Previous/Next-->
<div class="flex justify-between">
	<button type="button" on:click={() => ($tabSet = 0)} class="variant-filled-secondary btn mt-2 justify-end">Previous</button>
	<button type="button" on:click={() => ($tabSet = 2)} class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary">Next</button>
</div>
