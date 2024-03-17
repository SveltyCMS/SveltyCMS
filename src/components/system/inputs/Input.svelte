<script lang="ts">
	export let type: 'text' | 'password' | 'email' = 'text';
	export let label = '';
	export let labelClass = '';
	export let inputClass = '';
	export let placeholder = '';
	export let value = '';
	function typeAction(node: HTMLInputElement) {
		node.type = type;
	}
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	{#if label}
		<label for="input" class="w-32 flex-none {labelClass}">{label}</label>
	{/if}
	<input use:typeAction id="input" class="input grow text-black dark:text-primary-500 {inputClass}" bind:value {placeholder} {...$$props} />
</div>
