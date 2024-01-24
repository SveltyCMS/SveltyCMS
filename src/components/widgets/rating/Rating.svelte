<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage, defaultContentLanguage } from '@stores/store';
	import { mode, entryData } from '@stores/store';
	import { getFieldName } from '@utils/utils';

	import { Ratings } from '@skeletonlabs/skeleton';

	export let field: FieldType;

	export let maxRating = 5;
	export let color = 'warning-500';
	export let size = 25;
	export let iconEmpty = 'material-symbols:star-outline';
	export let iconHalf = 'material-symbols:star-half';
	export let iconFull = 'material-symbols:star';

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;

	function iconClick(event: CustomEvent<{ index: number }>): void {
		value.current = event.detail.index;
	}
</script>

<Ratings bind:value={_data[_language]} max={maxRating} interactive on:icon={iconClick}>
	<svelte:fragment slot="empty"><iconify-icon icon={iconEmpty} width={size} {color} /></svelte:fragment>
	<svelte:fragment slot="half"><iconify-icon icon={iconHalf} width={size} {color} /></svelte:fragment>
	<svelte:fragment slot="full"><iconify-icon icon={iconFull} width={size} {color} /></svelte:fragment>
</Ratings>

