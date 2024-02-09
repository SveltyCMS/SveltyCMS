<script lang="ts">
	import type { FieldType } from '.';

	// Stores
	import { mode, entryData, defaultContentLanguage } from '@stores/store';

	import { getFieldName } from '@utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;

	export const WidgetData = async () => _data;
</script>

<!-- TODO: Enhance Date entry -->
<div class="flex items-center gap-2">
	<input type="color" bind:value={_data[_language]} class="input rounded-md" />
	{#if _data[_language]}
		<p>Color code: <span class="text-primary-500">{_data[_language]}</span></p>
	{/if}
</div>
