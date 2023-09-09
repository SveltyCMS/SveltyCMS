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

<div>
	{#if label}
		<label for="input" class={labelClass}>{label}</label>
	{/if}
	<input use:typeAction id="input" class={inputClass} bind:value {placeholder} {...$$props} />
</div>

<style lang="postcss">
	div {
		min-width: 280px;
		margin: 5px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	label {
		margin-right: 10px;
	}
	input {
		border: 1px solid #242728;
		border-radius: 6px;
		padding: 5px;
		color: black;
		padding-right: 18px;
		outline-color: #65caec;
	}
</style>
