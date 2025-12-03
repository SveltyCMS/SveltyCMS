<script lang="ts">
	let { value }: { value: string | null | undefined } = $props();
</script>

{#if value}
	<div class="display-wrapper" title={value}>
		<div class="swatch-preview" style:background-color={value}></div>
		<span class="hex-code">{value}</span>
	</div>
{:else}
	<span>–</span>
{/if}

<style lang="postcss">
	.display-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch-preview {
		width: 1rem;
		height: 1rem;
		border-radius: 2px;
		border: 1px solid #ccc;
		flex-shrink: 0;
	}
	.hex-code {
		font-family: monospace;
		font-size: 0.875rem;
	}
</style>
