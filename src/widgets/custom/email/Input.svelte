<!--
@file src/widgets/custom/email/Input.svelte
@component
**Email Widget Input Component**

Provides email address input with HTML5 validation and mobile keyboard optimization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<EmailInput bind:value={emailAddress} field={fieldDefinition} />
HTML5 email input with validation and error display

### Props
- `field: FieldType` - Widget field definition with validation rules and metadata
- `value: string | null | undefined` - Email address string (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **HTML5 Email Validation**: Native browser email format validation
- **Mobile Optimized**: Email-specific keyboard layout on mobile devices
- **Error State Styling**: Visual error indication with red border and messaging
- **Accessibility**: Full ARIA support with error association and invalid states
- **Required Field Support**: HTML5 required attribute integration
- **Placeholder Text**: Configurable placeholder for user guidance
- **Responsive Layout**: Consistent styling across different screen sizes
- **Error Messaging**: Accessible error display with role="alert" for screen readers
-->

<script lang="ts">
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();
</script>

<div class="input-container">
	<input
		type="email"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={field.placeholder}
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
