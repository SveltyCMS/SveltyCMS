<script lang="ts">
	export let checked = false;
	export let svg;
	export let callback = () => {};
</script>

<div
	class="flex h-[28px] w-[28px] items-center justify-center rounded-md border-2 border-surface-800 dark:border-surface-500 {$$props.class}"
	role="checkbox"
	aria-checked={checked}
	tabindex="0"
	on:click|stopPropagation={() => {
		// console.log('Checkbox clicked. Previous checked state:', checked);
		checked = !checked;
		// console.log('New checked state:', checked);
		callback();
	}}
	on:keydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			// console.log('Checkbox clicked. Previous checked state:', checked);
			checked = !checked;
			// console.log('New checked state:', checked);
			callback();
		}
	}}
>
	{#if checked}
		<svelte:component this={svg} />
	{/if}
</div>
