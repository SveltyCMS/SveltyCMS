<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};
	// console.log('entryData', $entryData);
	// console.log('value', value);

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;

	export const WidgetData = async () => _data;

	// Reactive statement to update count
	$: count = _data[_language]?.length ?? 0;
	const getBadgeClass = (length: number) => {
		if (field?.minlength && length < field?.minlength) {
			return 'bg-red-600';
		} else if (field?.maxlength && length > field?.maxlength) {
			return 'bg-red-600';
		} else if (field?.count && length === field?.count) {
			return 'bg-green-600';
		} else if (field?.count && length > field?.count) {
			return 'bg-orange-600';
		} else if (field?.minlength) {
			return '!variant-filled-surface';
		} else {
			return '!variant-ghost-surface';
		}
	};

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
	{#if field?.prefix}
		<button class=" !px-2">{field?.prefix}</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		on:input={checkRequired}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== ''
			? field?.placeholder
			: field?.db_fieldName}
		required={field?.required}
		disabled={field?.disabled}
		readonly={field?.readonly}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		class="input flex-1 rounded-none"
	/>

	<!-- suffix -->
	{#if field?.suffix}
		<button class="!px-1">
			{#if field?.count || field?.minlength || field?.maxlength}
				<span class="badge mr-1 rounded-full {getBadgeClass(count)}">
					{#if field?.count && field?.minlength && field?.maxlength}
						{count}/{field?.maxlength}
					{:else if field?.count && field?.maxlength}
						{count}/{field?.maxlength}
					{:else if field?.count && field?.minlength}
						{count} => {field?.minlength}
					{:else if field?.minlength && field?.maxlength}
						{count} => {field?.minlength}/{field?.maxlength}
					{:else if field?.count}
						{count}/{field?.count}
					{:else if field?.maxlength}
						{count}/{field?.maxlength}
					{:else if field?.minlength}
						min {field?.minlength}
					{/if}
				</span>
			{/if}
			{field?.suffix}
		</button>
	{:else if field?.count || field?.minlength || field?.maxlength}
		<span class="badge rounded-none {getBadgeClass(count)}">
			{#if field?.count && field?.minlength && field?.maxlength}
				{count}/{field?.maxlength}
			{:else if field?.count && field?.maxlength}
				{count}/{field?.maxlength}
			{:else if field?.count && field?.minlength}
				{count} => {field?.minlength}
			{:else if field?.minlength && field?.maxlength}
				{count} => {field?.minlength}/{field?.maxlength}
			{:else if field?.count}
				{count}/{field?.count}
			{:else if field?.maxlength}
				{count}/{field?.maxlength}
			{:else if field?.minlength}
				min {field?.minlength}
			{/if}
		</span>
	{/if}
</div>

{#if !valid}
	<p class="text-error-500">Field is required.</p>
{/if}
