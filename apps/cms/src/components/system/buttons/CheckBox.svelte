<!-- 
 @file src/components/system/buttons/CheckBox.svelte
 @component
 **CheckBox component**

 ### Props
 - `checked?: boolean` - Bindable boolean value representing the checkbox state
 - `label?: string` - Optional label text displayed next to the checkbox
 - `class?: string` - Optional additional CSS classes for the checkbox container
 - `svg?: any` - Optional SVG icon to display when checked

 ### Features
 - **Accessible**: ARIA roles and attributes for screen readers
 - **Keyboard Navigable**: Focus styles for keyboard users
 - **Custom SVG Support**: Ability to pass custom SVG icons for the checked state
 - **Simple API**: Easy to use with bindable value and optional label
 -->

<script lang="ts">
	let checked = $state(false);
	const { svg, callback = () => {}, class: className = '' } = $props();

	function toggleCheckbox() {
		checked = !checked;
		callback();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			toggleCheckbox();
		}
	}
</script>

<div
	class="flex h-[28px] w-[28px] items-center justify-center rounded-md border-2 border-surface-800 dark:border-surface-500 {className}"
	role="checkbox"
	aria-checked={checked}
	tabindex="0"
	onclick={(e) => {
		e.stopPropagation();
		toggleCheckbox();
	}}
	onkeydown={handleKeydown}
>
	{#if checked}
		{@const SvgComponent = svg}
		<SvgComponent />
	{/if}
</div>
