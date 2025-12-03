<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import { validationStore } from '@stores/store.svelte';
	import type { FieldType } from './';

	let {
		field,
		value
	}: {
		field: FieldType;
		value: boolean | null | undefined;
	} = $props();

	const fieldName = getFieldName(field);

	// Initialize with proper boolean value
	let checked = $state(value ?? false);

	// Sync with parent value changes
	$effect(() => {
		checked = value ?? false;
	});

	// Update parent value and clear any validation errors
	function handleChange() {
		value = checked;
		validationStore.clearError(fieldName);
	}
</script>

<div class="flex items-center gap-3 p-2">
	<!-- Checkbox -->
	<input
		type="checkbox"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		bind:checked
		onchange={handleChange}
		class="checkbox"
		data-color={field.color}
		data-size={field.size}
		aria-label={field.label}
		aria-describedby={field.helper ? `${field.db_fieldName}-helper` : undefined}
	/>
	<!-- Label -->
	<label for={field.db_fieldName} class="cursor-pointer select-none text-sm font-medium">
		{field.label}
		{#if field.required}
			<span class="text-error-500">*</span>
		{/if}
	</label>
	{#if field.helper}
		<div id={`${field.db_fieldName}-helper`} class="text-xs text-gray-500">
			{field.helper}
		</div>
	{/if}
</div>

<style lang="postcss">
	.checkbox {
		@apply h-5 w-5 cursor-pointer rounded border-gray-300 transition-colors duration-200;
		appearance: none;
		background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='m13.854 3.646-7.5 7.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 0 1 .708-.708L6 10.293l7.146-7.147a.5.5 0 0 1 .708.708z'/%3e%3c/svg%3e");
		background-size: 0.75rem;
		background-position: center;
		background-repeat: no-repeat;
	}

	.checkbox:checked {
		@apply border-current bg-current;
		background-size: 0.75rem;
	}

	.checkbox:not(:checked) {
		background-image: none;
	}

	.checkbox[data-color='primary'] {
		@apply border-gray-300 text-primary-600 focus:ring-primary-500;
	}
	.checkbox[data-color='primary']:focus {
		@apply ring-2 ring-primary-500 ring-offset-2;
	}

	.checkbox[data-color='secondary'] {
		@apply text-secondary-600 focus:ring-secondary-500;
	}
	.checkbox[data-color='secondary']:focus {
		@apply ring-2 ring-secondary-500 ring-offset-2;
	}

	.checkbox[data-color='accent'] {
		@apply text-purple-600 focus:ring-purple-500;
	}
	.checkbox[data-color='accent']:focus {
		@apply ring-2 ring-purple-500 ring-offset-2;
	}

	.checkbox[data-size='sm'] {
		@apply h-4 w-4;
		background-size: 0.625rem;
	}
	.checkbox[data-size='sm']:checked {
		background-size: 0.625rem;
	}

	.checkbox[data-size='lg'] {
		@apply h-6 w-6;
		background-size: 0.875rem;
	}
	.checkbox[data-size='lg']:checked {
		background-size: 0.875rem;
	}

	.checkbox:hover {
		@apply border-gray-400;
	}

	.checkbox:disabled {
		@apply cursor-not-allowed opacity-50;
	}

	.checkbox:disabled + label {
		@apply cursor-not-allowed opacity-50;
	}
</style>
