<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { mode, entryData } from '@stores/store';

	import { getFieldName } from '@utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;

	export const WidgetData = async () => _data;

	let valid = true;
	function checkRequired() {
		if (field?.required && _data == '') {
			valid = false;
		} else {
			valid = true;
		}
	}
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	<input
		type="number"
		bind:value={_data[_language]}
		on:input={checkRequired}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		class="input flex-1 rounded-none"
	/>
</div>

{#if !valid}
	<p class="text-error-500">Field is required.</p>
{/if}
