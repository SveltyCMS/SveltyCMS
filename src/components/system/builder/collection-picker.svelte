<!--
@file src/components/system/builder/collection-picker.svelte
@description Component for selecting a collection from available collections
-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	import Select from '@components/ui/select.svelte';

	interface Props {
		value?: string;
	}

	let { value = $bindable('') }: Props = $props();

	import type { Schema } from '@src/content/types';

	// Get collection names
	const collectionNames = $derived(Object.values((collections as any).all as Record<string, Schema>).map((c) => c.name));
	const collectionOptions = $derived(
		collectionNames
			.filter((name): name is string => name != null && name !== '')
			.map((name) => ({ value: name, label: name }))
	);
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	<Select
		bind:value
		label="Collection"
		class="grow"
		placeholder="Select a collection"
		options={collectionOptions}
	/>
</div>
