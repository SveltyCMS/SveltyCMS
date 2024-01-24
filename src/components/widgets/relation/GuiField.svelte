<script lang="ts">
	import type { Schema } from '@collections/types';
	import { collections } from '@stores/store';
	import DropDown from '@components/system/dropDown/DropDown.svelte';

	export let value: Schema | string = '';
	export const theme: 'dark' | 'light' = 'dark';
	export const label = '';

	let _value =
		typeof value == 'string'
			? value
			: $collections.find((entry) => {
					return typeof value != 'string' && entry[1].name == value.name;
				})?.[0] || 'null';
	$: value = _value;

	//console.log('collections:', $collections);
</script>

<!-- <DropDown items={Object.values($collections).map((x) => x.name)} bind:selected={_value} label="Select Collection" /> -->
<DropDown items={$collections.map((collection) => collection.name)} bind:selected={_value} label="Select Collection" />
