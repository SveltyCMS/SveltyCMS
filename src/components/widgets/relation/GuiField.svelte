<script lang="ts">
	import type { Schema, CollectionTypes } from '@src/content/types';

	// Stores
	import { collections } from '@src/stores/collectionStore.svelte';

	// Components
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';

	interface Props {
		value?: CollectionTypes;
	}

	let { value = $bindable<CollectionTypes>('null') }: Props = $props();

	// Initialize _value with proper type checking
	let _value = $state<CollectionTypes>(value);

	// Update value when _value changes
	$effect(() => {
		value = _value;
	});

	// Prepare items for dropdown with proper typing
	const items: CollectionTypes[] = collections.value.map((collection: Schema) => collection.name);

	// Effect to update selected in DropDown when _value changes
	$effect(() => {
		if (_value && !items.includes(_value)) {
			_value = items[0] || 'null';
		}
	});
</script>

<DropDown {items} selected={_value} label="Select Collection" modifier={(item) => item} class="w-full" />
