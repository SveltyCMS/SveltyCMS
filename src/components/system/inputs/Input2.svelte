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

<div class="m-1 flex min-w-[280px] items-center gap-2">
	{#if label}
		<label for="input" class={labelClass}>{label}:</label>
	{/if}
	<input use:typeAction id="input" class="{inputClass} input" bind:value {placeholder} {...$$props} />
</div>
