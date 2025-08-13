<!-- 
@file src/components/system/inputs/Input.svelte
@description Component for file input 

Features:
- File input 
- Multiple file input
- Drag and drop
-->

<script lang="ts">
	interface InputProps {
		type: 'text' | 'password' | 'email';
		label?: string;
		labelClass?: string;
		inputClass?: string;
		placeholder?: string;
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
	<input use:typeAction id="input" class="input grow text-black dark:text-primary-500 {inputClass}" bind:value {placeholder} />
</div>
