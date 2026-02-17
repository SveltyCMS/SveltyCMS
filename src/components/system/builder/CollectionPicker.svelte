<!--
@file src/components/system/builder/CollectionPicker.svelte
@description Component for selecting a collection from available collections
-->

<script lang="ts">
	import { collections } from '@stores/collectionStore.svelte';

	interface Props {
		value?: string;
	}

	let { value = $bindable('') }: Props = $props();

	import type { Schema } from '@src/content/types';

	// Get collection names
	const collectionNames = $derived(Object.values((collections as any).all as Record<string, Schema>).map((c) => c.name));
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	<label for="collection-select" class="w-32 flex-none">Collection</label>
	<select id="collection-select" class="input grow text-black dark:text-primary-500" bind:value>
		<option value="">Select a collection</option>
		{#each collectionNames as name (name)}
			<option value={name}>{name}</option>
		{/each}
	</select>
</div>
