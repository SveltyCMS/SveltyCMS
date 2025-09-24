<!--
@file src/widgets/core/input/Input.svelte
@component
**Text Input Widget Input Component**

Provides multilingual text input with character counting and validation.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<TextInput bind:value={textValue} field={fieldDefinition} />
 Supports both translated and non-translated text input 

### Props
- `field: FieldType` - Widget field definition with validation rules and metadata
- `value: Record<string, string> | null | undefined` - Multilingual text object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Multilingual Support**: Handles translated content with language-specific values
- **Character Counting**: Real-time character count with max length validation
- **Input Validation**: HTML5 validation with minLength/maxLength constraints
- **Error Handling**: Accessible error display with ARIA attributes
- **Reactive Language**: Automatically switches language based on content store
- **Immutable Updates**: Ensures proper Svelte reactivity with object updates
- **Accessibility**: Full ARIA support for screen readers and assistive technology
-->

<script lang="ts">
	import { contentLanguage } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: Record<string, string> | null | undefined; error?: string | null } = $props();

	// Determine the current language for this translatable field.
	const lang = $derived(field.translated ? $contentLanguage : 'default');

	// Get the text for the current language, defaulting to an empty string.
	let text = $derived(value?.[lang] ?? '');

	// When the user types, update the parent's `value` object immutably.
	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const newText = event.currentTarget.value;
		// Create a new object to ensure Svelte's reactivity triggers correctly.
		value = {
			...(value ?? {}),
			[lang]: newText
		};
	}
</script>

<div class="input-container">
	<div class="input-wrapper">
		<input
			type="text"
			id={field.db_fieldName}
			name={field.db_fieldName}
			required={field.required}
			placeholder={field.placeholder}
			minLength={field.minLength}
			maxLength={field.maxLength}
			value={text}
			oninput={handleInput}
			class="input"
			class:invalid={error}
			aria-invalid={!!error}
			aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
		/>
		{#if field.maxLength}
			<span class="counter" class:error={text.length > field.maxLength}>{text.length} / {field.maxLength}</span>
		{/if}
	</div>

	{#if error}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert">
			{error}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
		width: 100%;
	}
	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input {
		flex-grow: 1;
	}
	.input.invalid {
		border-color: #ef4444;
	}
	.counter {
		position: absolute;
		right: 0.75rem;
		font-size: 0.75rem;
		color: #9ca3af;
	}
	.counter.error {
		color: #ef4444;
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
