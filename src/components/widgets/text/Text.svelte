<script lang="ts">
	import type { Text_Field } from './types';

	import { language } from '$src/stores/store';
	import { PUBLIC_LANGUAGE } from '$env/static/public';

	export let field: Text_Field;
	export let value: string = '';
	export let widgetValue: any = {};

	// Set default values
	$: !value && (value = '');
	$: widgetValue = value || {};

	// Set language
	$: _language = field.localization ? $language : PUBLIC_LANGUAGE;

	// zod validation gete data from colections
	import * as z from 'zod';

	const Text_Field_Schema = z.object({
		db_fieldName: z.string(),
		icon: z.string(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
		count: z.number().optional(),
		minlength: z.number().optional(),
		maxlength: z.number().optional(),
		placeholder: z.string().optional(),
		localization: z.boolean(),
		required: z.boolean(),
		disabled: z.boolean().optional(),
		readonly: z.boolean().optional()
	});

	// Reactive statement to update count
	$: count = widgetValue[_language]?.length ?? 0;

	const getBadgeClass = (length: number) => {
		if (field.minlength && length < field.minlength) {
			return 'bg-red-600 text-white';
		} else if (field.maxlength && length > field.maxlength) {
			return 'bg-red-600 text-white';
		} else if (field.count && length === field.count) {
			return 'bg-green-600 text-white';
		} else if (field.count && length > field.count) {
			return 'bg-orange-600 text-white';
		} else if (field.minlength) {
			return 'border bg-surface-600 text-white';
		} else {
			return 'bg-surface-600 text-white dark:bg-white dark:text-surface-600';
		}
	};
</script>

<!-- TODO: Reduce Pre/Sufix Margings -->

<div class="input-group grid-cols-[auto_1fr_auto]">
	{#if field.prefix}
		<div class="text-surface-600 dark:text-surface-200">{field.prefix}</div>
	{/if}

	<input
		bind:value={widgetValue[_language]}
		type="text"
		name={field.db_fieldName}
		id={field.db_fieldName}
		placeholder={field.placeholder && field.placeholder !== ''
			? field.placeholder
			: field.db_fieldName}
		required={field.required}
		disabled={field.disabled}
		readonly={field.readonly}
		minlength={field.minlength}
		maxlength={field.maxlength}
	/>
	<div class="-mx-1 flex ">
		<!-- badge with count -->
		{#if field.count || field.minlength || field.maxlength}
			{#if field.suffix}
				<span class="badge -my-1 -mx-1 mr-1  {getBadgeClass(count)}">
					{#if field.count && field.minlength && field.maxlength}
						{count}/{field.maxlength}
					{:else if field.count && field.maxlength}
						{count}/{field.maxlength}
					{:else if field.count && field.minlength}
						{count}/{field.minlength}
					{:else if field.minlength && field.maxlength}
						{count}/{field.maxlength} (min {field.minlength})
					{:else if field.count}
						{count}/{field.count}
					{:else if field.maxlength}
						{count}/{field.maxlength}
					{:else if field.minlength}
						{count} (min {field.minlength})
					{/if}
				</span>
			{:else}
				<span class="badge -my-1 -mx-1 mr-1  {getBadgeClass(count)}">
					{#if field.count && field.minlength && field.maxlength}
						{count}/{field.maxlength}
					{:else if field.count && field.maxlength}
						{count}/{field.maxlength}
					{:else if field.count && field.minlength}
						{count}/{field.minlength}
					{:else if field.minlength && field.maxlength}
						{count}/{field.maxlength} (min {field.minlength})
					{:else if field.count}
						{count}/{field.count}
					{:else if field.maxlength}
						{count}/{field.maxlength}
					{:else if field.minlength}
						{count} (min {field.minlength})
					{/if}
				</span>
			{/if}
		{/if}
		<!-- suffix -->
		{#if field.suffix}
			<span class="-mr-1 text-surface-600 dark:text-surface-200">{field.suffix}</span>
		{/if}
	</div>
</div>
