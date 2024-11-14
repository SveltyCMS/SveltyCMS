<script lang="ts">
	import type { Schema, CollectionTypes } from '@src/collections/types';

	// Stores
	import { collections } from '@root/src/stores/collectionStore.svelte';

	// Components
	import DropDown from '@components/system/dropDown/DropDown.svelte';

	interface Props {
		value?: Schema | string;
	}

	let { value = $bindable('') }: Props = $props();

	// Initialize _value with proper type checking
	let _value = $state<CollectionTypes>(
		typeof value === 'string'
			? (value as CollectionTypes)
			: (Object.values($collections).find((entry) => {
					return typeof value !== 'string' && entry[1].name === value.name;
				})?.[0] as CollectionTypes) || ('null' as CollectionTypes)
	);

	// Update value when _value changes
	$effect(() => {
		value = _value;
	});

	// Prepare items for dropdown with proper typing
	const items: CollectionTypes[] = Object.values($collections).map((collection) => collection.name as CollectionTypes);

	// Update _value when selected changes in DropDown
	function handleSelect(selected: CollectionTypes) {
		_value = selected;
	}

	// Effect to update selected in DropDown when _value changes
	$effect(() => {
		if (_value && !items.includes(_value)) {
			_value = items[0] || ('null' as CollectionTypes);
		}
	});
</script>

<DropDown {items} selected={_value} label="Select Collection" modifier={(item: CollectionTypes) => item} class="w-full" />
