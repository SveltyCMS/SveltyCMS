<!-- 
 @file src/components/system/buttons/CheckBox.svelte
 @description - Checkbox component 
 -->

<script lang="ts">
	let checked = $state(false);
	let {
		svg,
		callback = () => {},
		class: className = ''
	} = $props<{
		svg: any;
		callback?: () => void;
		class?: string;
	}>();

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
