<script lang="ts">
	import type { Text_Field } from './types';

	import { language } from '@src/stores/store';
	import env from '@root/env';

	export let field: Text_Field;
	export let value = {};
	export let widgetValue: any = {};

	$: !value && (value = {}); //default value

	$: widgetValue = value || {};

	$: _language = field.localization ? $language : env.LANGUAGE;

	// let charCount: number;
	// $: charCount = widgetValue[_language].length;

	// const badgeColor = (charCount: number, minlength: number, maxlength: number): string => {
	// 	if (charCount < minlength) return 'text-gray';
	// 	if (charCount >= minlength && charCount < maxlength * 0.9) return 'text-orange-500';
	// 	if (charCount >= maxlength * 0.9 && charCount <= maxlength) return 'text-green-500';
	// 	if (charCount > maxlength) return 'text-red-500';
	// 	return 'text-gray';
	// };
</script>

<!-- TODO: add Validetion like class="input-success" -->
<!-- TODO: Fix input disabled/readonly" -->
<!-- TODO: Reduce Pre/Sufix Margings -->
<!-- TODO: Fix Badge text count colors" -->

<div class="input-group input-group-divider grid-cols-[auto_1fr_auto]">
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
	<div class="-mx-1 flex divide-none">
		{#if field.count}
			{#if field.suffix}
				<span
					class="badge -my-1 -mx-1 mr-1 border bg-surface-600 text-white dark:bg-white dark:text-surface-600"
				>
					<!-- {charCount}/{field.count} -->
					{field.count}
				</span>
			{:else}
				<span
					class="badge -my-1 -mx-1 mr-1 border bg-surface-600 text-white dark:bg-white dark:text-surface-600"
				>
					<!-- {charCount}/{field.count} -->
					{field.count}
				</span>
			{/if}
		{/if}

		{#if field.suffix}
			<span class="-mr-1 text-surface-600 dark:text-surface-200">{field.suffix}</span>
		{/if}
	</div>
</div>
