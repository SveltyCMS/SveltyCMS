<script lang="ts">
	import type { FieldType } from '.';
	import { defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;

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

<div class="btn-group variant-filled-surface flex w-full rounded">
	<input
		type="number"
		bind:value={_data[_language]}
		on:input={checkRequired}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== ''
			? field?.placeholder
			: field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		class="input flex-1 rounded-none"
	/>
</div>

{#if !valid}
	<p class="text-error-500">Field is required.</p>
{/if}
