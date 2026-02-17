<script lang="ts">
	interface Props {
		value: { amount: number | null; currency: string } | null;
	}

	let { value }: Props = $props();

	function formatPrice(val: { amount: number | null; currency: string } | null) {
		if (!val || val.amount === null || val.amount === undefined) return '—';
		try {
			return new Intl.NumberFormat('en-US', {
				// TODO: Use system locale
				style: 'currency',
				currency: val.currency
			}).format(val.amount);
		} catch (_e) {
			return `${val.amount} ${val.currency}`;
		}
	}
</script>

<div class="text-sm font-mono">{formatPrice(value)}</div>
