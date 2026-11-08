<!--
@file tests/unit/components/dom/fixtures/breadcrumb-dynamic.svelte
@description Test wrapper: a library-style `crumb` snippet over reactive items.
-->

<script lang="ts">
	import Breadcrumb from '@src/components/ui/breadcrumb.svelte';

	let { items }: { items: Array<{ label: string; href: string }> } = $props();
</script>

<Breadcrumb {items}>
	{#snippet crumb({ item, isLast })}
		{#if isLast}
			<span data-testid="crumb" aria-current="page">{item.label}</span>
		{:else}
			<a data-testid="crumb" href={item.href}>{item.label}</a>
		{/if}
	{/snippet}
</Breadcrumb>
