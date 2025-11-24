<script lang="ts">
	// ListBox compat component
	import type { Snippet } from 'svelte';
	
	interface Props {
		children?: Snippet;
		[key: string]: any;
	}
	
	let { children, ...rest }: Props = $props();
</script>

<div class="listbox border border-surface-300 rounded" {...rest}>
	{@render children?.()}
</div>
