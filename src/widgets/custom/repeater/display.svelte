<script lang="ts">
	interface Props {
		field: any;
		value: any[];
	}

	let { value = [] }: Props = $props();
	import Badge from '@components/ui/badge.svelte';
</script>

<div class="text-sm">
	{#if value && Array.isArray(value) && value.length > 0}
		<Badge variant="secondary" size="sm">{value.length} items</Badge>
		<div class="mt-1 text-xs opacity-70 truncate max-w-[200px]">{JSON.stringify(value[0]).substring(0, 30)}...</div>
	{:else}
		<span class="opacity-50">—</span>
	{/if}
</div>
