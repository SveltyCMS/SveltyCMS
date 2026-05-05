<script lang="ts">
	import { app } from '@src/stores/store.svelte';
	import type { PriceValue } from './types';

	let { value }: { value: PriceValue | null | undefined } = $props();

	const lang = $derived(app.systemLanguage);

	const formattedPrice = $derived.by(() => {
		if (!value || typeof value.amount !== 'number') return '–';
		try {
			return new Intl.NumberFormat(lang, {
				style: 'currency',
				currency: value.currency
			}).format(value.amount);
		} catch {
			return `${value.amount} ${value.currency}`;
		}
	});
</script>

<div class="price-display inline-flex items-center gap-1.5 font-semibold text-surface-900 dark:text-surface-50">
	{#if value && typeof value.amount === 'number'}
		<iconify-icon icon="mdi:tag-outline" width="16" class="text-surface-400 dark:text-surface-500"></iconify-icon>
		<span>{formattedPrice}</span>
	{:else}
		<span class="text-surface-400 dark:text-surface-600">–</span>
	{/if}
</div>

<style>
	.price-display {
		font-family: inherit;
		letter-spacing: -0.01em;
	}
</style>
