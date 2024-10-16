<script lang="ts">
	import type { Schema } from '@collections/types';

	// Stores
	import { collections } from '@stores/collectionStore';

	// Components
	import DropDown from '@components/system/dropDown/DropDown.svelte';

	export let value: Schema | string = '';
	export const theme: 'dark' | 'light' = 'dark';
	export const label = '';

	let _value =
		typeof value == 'string'
			? value
			: Object.values($collections).find((entry) => {
					return typeof value != 'string' && entry[1].name == value.name;
				})?.[0] || 'null';
	$: value = _value;
</script>

<DropDown items={Object.values($collections).map((collection) => collection.name)} bind:selected={_value} label="Select Collection" />
