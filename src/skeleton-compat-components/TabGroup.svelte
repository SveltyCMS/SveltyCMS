<script lang="ts">
	// TabGroup component compat wrapper
	import type { Snippet } from 'svelte';
	
	interface Props {
		children?: Snippet;
		[key: string]: any;
	}
	
	let { children, ...rest }: Props = $props();
</script>

<div class="tab-group flex gap-2" {...rest}>
	{@render children?.()}
</div>
