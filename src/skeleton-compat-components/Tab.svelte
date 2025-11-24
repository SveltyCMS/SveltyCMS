<script lang="ts">
	// Tab component compat wrapper
	import type { Snippet } from 'svelte';
	
	interface Props {
		group: number;
		name: string;
		value: number;
		children?: Snippet;
		[key: string]: any;
	}
	
	let { group, name, value, children, ...rest }: Props = $props();
	
	const isActive = $derived(group === value);
</script>

<button
	class="tab {isActive ? 'tab-active' : ''}"
	class:variant-filled-primary={isActive}
	onclick={() => group = value}
	{...rest}
>
	{@render children?.()}
</button>
