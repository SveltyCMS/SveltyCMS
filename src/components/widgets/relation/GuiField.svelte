<script lang="ts">
	import type { Schema, CollectionNames } from '@src/collections/types';

	// Stores
	import { collections } from '@stores/collectionStore';

	// Components
	import DropDown from '@components/system/dropDown/DropDown.svelte';

	interface Props {
		value?: Schema | string;
	}

	let { value = $bindable('') }: Props = $props();

	// Initialize _value with proper type checking
	let _value = $state<CollectionNames>(
		typeof value === 'string'
			? (value as CollectionNames)
			: (Object.values($collections).find((entry) => {
					return typeof value !== 'string' && entry[1].name === value.name;
				})?.[0] as CollectionNames) || ('null' as CollectionNames)
	);

	// Update value when _value changes
	$effect(() => {
		value = _value;
	});

	// Prepare items for dropdown with proper typing
	const items: CollectionNames[] = Object.values($collections).map((collection) => collection.name as CollectionNames);

	// Update _value when selected changes in DropDown
	function handleSelect(selected: CollectionNames) {
		_value = selected;
	}

	// Effect to update selected in DropDown when _value changes
	$effect(() => {
		if (_value && !items.includes(_value)) {
			_value = items[0] || ('null' as CollectionNames);
		}
	});
</script>

<DropDown {items} selected={_value} label="Select Collection" modifier={(item: CollectionNames) => item} class="w-full" />
