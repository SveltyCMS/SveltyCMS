<!-- 
@file src/widgets/core/relation/GuiField.svelte
@component
**GuiField widget component to display relation field#**

@example
<GuiField label="GuiField" db_fieldName="guiField" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { Schema, ContentTypes } from '@src/content/types';

	// Stores
	import { collections } from '@src/stores/collectionStore.svelte';

	// Components
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';

	interface Props {
		value?: ContentTypes;
	}

	let { value = $bindable<ContentTypes>(undefined) }: Props = $props();

	// Initialize _value with proper type checking
	let _value = $state<ContentTypes>(value);

	// Update value when _value changes
	$effect(() => {
		value = _value;
	});

	// Prepare items for dropdown with proper typing
	const items: ContentTypes[] = collections.value.map((collection: Schema) => collection.name);

	// Effect to update selected in DropDown when _value changes
	$effect(() => {
		if (_value && !items.includes(_value)) {
			_value = items[0] || 'null';
		}
	});
</script>

<DropDown {items} selected={_value} label="Select Collection" modifier={(item) => item} class="w-full" />
