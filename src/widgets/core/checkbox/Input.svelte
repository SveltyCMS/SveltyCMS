<script lang="ts">
	import type { FieldType } from './';

	let {
		field,
		value
	}: {
		field: FieldType;
		value: boolean | null | undefined;
	} = $props();

	// The `checked` state is bound directly to the parent's `value` rune.
	// We ensure it's a boolean, defaulting to false.
	let checked = $state(value ?? false);

	// When the local `checked` state changes, update the parent `value`.
	$effect(() => {
		value = checked;
	});
</script>

<div class="flex items-center gap-3 p-2">
	<!-- Checkbox -->
	<input
		type="checkbox"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		bind:checked
		class="checkbox"
		data-color={field.color}
		data-size={field.size}
		aria-label={field.label}
	/>
	<!-- Label -->
	<label for={field.db_fieldName} class="cursor-pointer select-none text-sm font-medium">
		{field.label}
		{#if field.required}
			<span class="text-error-500">*</span>
		{/if}
	</label>
</div>

<style lang="postcss">
	.checkbox {
		@apply h-5 w-5 rounded border-gray-300;
	}
	.checkbox[data-color='primary'] {
		@apply text-primary-600 focus:ring-primary-500;
	}
	.checkbox[data-color='secondary'] {
		@apply text-secondary-600 focus:ring-secondary-500;
	}
	.checkbox[data-color='accent'] {
		@apply text-primary-600 focus:ring-primary-500;
	}
	.checkbox[data-size='sm'] {
		@apply h-4 w-4;
	}
	.checkbox[data-size='lg'] {
		@apply h-6 w-6;
	}
</style>
