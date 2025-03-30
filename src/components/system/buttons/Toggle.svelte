<!-- 
@files src/components/system/buttons/Toggle.svelte
@component
**Toggle component for on/off switches**

@example
<Toggle bind:value />

#### Props
- `trackClass` {string}: Additional track classes (default: '')
- `thumbClass` {string}: Additional thumb classes (default: '')
- `value` {boolean}: Initial value (bindable, default: false)
- `width` {number}: Track width (default: 80)
- `height` {number}: Track height (default: 40)
- `label` {string}: Label text (default: '')
- `labelClass` {string}: Additional label classes (default: '')

### Features
- Toggle component for on/off switches
- Customizable track and thumb styles
- Accessible checkbox input
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	let {
		trackClass = '',
		thumbClass = '',
		value = $bindable(false),
		width = 80,
		height = 40,
		label = '',
		labelClass = ''
	} = $props<{
		trackClass?: string;
		thumbClass?: string;
		value?: boolean;
		width?: number;
		height?: number;
		label?: string;
		labelClass?: string;
	}>();
</script>

<div class="flex w-full items-center justify-between">
	<p class={twMerge('text-white ', labelClass)}>{label}</p>
	<button
		onclick={() => (value = !value)}
		class={twMerge('relative cursor-pointer rounded bg-white ', trackClass)}
		style="width: {width}px; height: {height}px"
		aria-label="Toggle button"
	>
		<div
			class:checked={value}
			class={twMerge('bg-surface-400 absolute right-1/2 rounded transition duration-200', thumbClass)}
			style="width: {width / 2}px; height: {height}px"
		></div>
	</button>
</div>

<style>
	.checked {
		right: 0;
		background-color: rgb(4, 203, 4);
	}
</style>
