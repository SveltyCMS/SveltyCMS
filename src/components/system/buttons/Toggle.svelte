<!-- 
@file src/components/system/buttons/Toggle.svelte
@component
**Toggle component**

@example
<Toggle bind:value={isEnabled} label="Enable feature" trackClass="bg-blue-500" thumbClass="shadow-lg" labelClass="font-medium text-gray-700" />

### Props
- `trackClass?: string` - Tailwind CSS classes for the toggle track
- `thumbClass?: string` - Tailwind CSS classes for the toggle thumb
- `value?: boolean` - Bindable boolean value representing the toggle state
- `label?: string` - Optional label text displayed next to the toggle
- `labelClass?: string` - Tailwind CSS classes for the label text

### Features
- **Customizable Styling**: Tailwind CSS classes for track, thumb, and label
- **Accessible**: ARIA roles and attributes for screen readers
- **Keyboard Navigable**: Focus styles for keyboard users
- **Simple API**: Easy to use with bindable value and optional label
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	let { trackClass = '', thumbClass = '', value = $bindable(false), label = '', labelClass = '', class: className = '' } = $props();
</script>

<label class={twMerge('flex w-full cursor-pointer items-center justify-between', className)}>
	{#if label}
		<span class={twMerge('mr-3', labelClass)}>{label}</span>
	{/if}
	<button
		type="button"
		role="switch"
		aria-checked={value}
		aria-label={label || 'Toggle'}
		onclick={() => (value = !value)}
		class={twMerge(
			'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
			value ? 'bg-green-500' : 'bg-gray-200',
			trackClass
		)}
	>
		<span
			aria-hidden="true"
			class={twMerge(
				'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
				value ? 'translate-x-5' : 'translate-x-0',
				thumbClass
			)}
		></span>
	</button>
</label>
