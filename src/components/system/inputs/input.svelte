<!-- 
@file src/components/system/inputs/input.svelte
@component 
**Component for file input**

### Props:
- `type`: 'text' | 'password' | 'email' - Type of the input field.
- `label`: string - Label for the input field.
- `labelClass`: string - Additional classes for the label.
- `inputClass`: string - Additional classes for the input field.
- `placeholder`: string - Placeholder text for the input field.
- `value`: string - Value of the input field.

### Features:
- File input 
- Multiple file input
- Drag and drop
-->

<script lang="ts">
	interface InputProps {
		inputClass?: string;
		label?: string;
		labelClass?: string;
		placeholder?: string;
		type: 'text' | 'password' | 'email';
		value?: string;
	}

	let { type = 'text', label, labelClass, inputClass, placeholder, value = $bindable('') }: InputProps = $props();
	function typeAction(node: HTMLInputElement) {
		node.type = type;
	}
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	{#if label}
		<label for="input" class="w-32 flex-none {labelClass}">{label}</label>
	{/if}
	<input
		use:typeAction
		id="input"
		class="input grow text-black dark:text-primary-500 bg-surface-50 dark:bg-surface-700 {inputClass}"
		bind:value
		{placeholder}
	/>
</div>
