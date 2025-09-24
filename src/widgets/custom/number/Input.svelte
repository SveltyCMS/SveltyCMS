<!--
@file src/widgets/custom/number/Input.svelte
@component
**Number Widget Input Component**

Provides numeric input with HTML5 validation, range constraints, and step controls.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<NumberInput bind:value={numericValue} field={{ min: 0, max: 100, step: 0.01 }} />
HTML5 number input with validation and mobile numeric keyboard

### Props
- `field: FieldType` - Widget field definition with min/max/step constraints
- `value: number | null | undefined` - Numeric value (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **HTML5 Number Input**: Native browser numeric validation and controls
- **Range Constraints**: Configurable min/max values for validation
- **Step Controls**: Precise increment/decrement with configurable step size
- **Mobile Optimized**: Numeric keyboard layout on mobile devices
- **Spinner Controls**: Browser-native up/down arrows for value adjustment
- **Error State Styling**: Visual error indication with red border and messaging
- **Accessibility**: Full ARIA support with error association and invalid states
- **Required Field Support**: HTML5 required attribute integration
- **PostCSS Styling**: Modern CSS with utility-first approach
-->

<script lang="ts">
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: number | null | undefined; error?: string | null } = $props();
</script>

<div class="input-container">
	<input
		type="number"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={field.placeholder}
		min={field.min}
		max={field.max}
		step={field.step}
		bind:value
		class="input"
		class:invalid={error}
		aria-invalid={!!error}
		aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
	/>
	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	/* Styles are identical to the Text input component */
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
		width: 100%;
	}
	.input.invalid {
		border-color: #ef4444;
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
