<!--
@file src/widgets/custom/phoneNumber/Input.svelte
@component
**PhoneNumber Widget Input Component**

Provides telephone number input with HTML5 validation and mobile keyboard optimization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<PhoneNumberInput bind:value={phoneNumber} field={{ pattern: "[0-9+-\\s]+" }} />
<!-- HTML5 tel input with pattern validation and mobile keyboard

### Props
- `field: FieldType` - Widget field definition with pattern validation and metadata
- `value: string | null | undefined` - Phone number string (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **HTML5 Tel Input**: Native telephone input type for optimal mobile experience
- **Pattern Validation**: Configurable regex patterns for format validation
- **Mobile Optimized**: Telephone keypad layout on mobile devices
- **International Support**: Handles various phone number formats and country codes
- **Error State Styling**: Visual error indication with red border and messaging
- **Accessibility**: Full ARIA support with error association and invalid states
- **Required Field Support**: HTML5 required attribute integration
- **Placeholder Text**: Configurable placeholder for user guidance
- **PostCSS Styling**: Modern CSS with utility-first approach
-->

<script lang="ts">
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();
</script>

<div class="input-container">
	<input
		type="tel"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={field.placeholder}
		pattern={field.pattern}
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
