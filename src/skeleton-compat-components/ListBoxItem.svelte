<script lang="ts">
	// ListBoxItem compat component
	import type { Snippet } from 'svelte';
	
	interface Props {
		group?: any;
		name?: string;
		value?: any;
		children?: Snippet;
		[key: string]: any;
	}
	
	let { group = $bindable(), name = '', value, children, ...rest }: Props = $props();
	
	const isActive = $derived(group === value);
</script>

<button
	type="button"
	class="listbox-item p-2 w-full text-left hover:bg-surface-100 dark:hover:bg-surface-800"
	class:bg-primary-500={isActive}
	class:text-white={isActive}
	onclick={() => group = value}
	{...rest}
>
	{@render children?.()}
</button>
