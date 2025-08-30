<!--
@file src/widgets/custom/phoneNumber/PhoneNumber.svelte
@component
**PhoneNumber widget component that allows users to enter a phone number**

@example
<PhoneNumber label="Phone Number" db_fieldName="phoneNumber" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/globalSettings';
	import type { FieldType } from '.';
	// Stores
	import { collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
	import { validationStore } from '@stores/store.svelte';

	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import { parse, pipe, regex, string, type ValiError } from 'valibot';
	// Focus management
	import { onDestroy, onMount } from 'svelte';
	interface Props {
		field: FieldType;
		value?: any;
	}

	onMount(() => {
		if (field?.required && !_data[_language]) {
			inputElement?.focus();
		}
	});

	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	export const WidgetData = async () => _data;
</script>

<div class="input-container relative mb-4">
	<div class="variant-filled-surface btn-group flex w-full rounded">
		<input
			type="tel"
			bind:this={inputElement}
			bind:value={_data[_language]}
			onblur={validateInput}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required}
			readonly={field?.readonly}
			class="input w-full text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			aria-required={field?.required}
			data-testid="phone-input"
		/>
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
