<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';
	import { createEventDispatcher } from 'svelte';

	// Stores
	import { contentLanguage, mode, entryData } from '@stores/store';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	const dispatch = createEventDispatcher();

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: dispatch('change', _data);

	let validationError: string | null = null;

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

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()

		// Widget Specfic
	});

	function validateInput() {
		try {
			// Change .parseAsync to .parse
			validateSchema.parse(_data.value);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	{#if field?.prefix}
		<button class=" !px-2">{field?.prefix}</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		on:input={validateInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		disabled={field?.disabled}
		readonly={field?.readonly}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
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

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
