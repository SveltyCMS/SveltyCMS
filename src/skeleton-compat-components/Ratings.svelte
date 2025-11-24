<script lang="ts">
	// Ratings compat component
	interface Props {
		value?: number;
		max?: number;
		[key: string]: any;
	}
	
	let { value = $bindable(0), max = 5, ...rest }: Props = $props();
	
	function rate(rating: number) {
		value = rating;
	}
</script>

<div class="ratings flex gap-1" {...rest}>
	{#each Array(max) as _, i}
		<button
			class="rating text-2xl"
			class:text-yellow-400={i < value}
			class:text-surface-300={i >= value}
			onclick={() => rate(i + 1)}
			type="button"
		>
			★
		</button>
	{/each}
</div>
