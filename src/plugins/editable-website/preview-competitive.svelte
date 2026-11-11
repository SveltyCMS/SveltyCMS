<!--
@file src/plugins/editable-website/preview-competitive.svelte
@component Competitive dashboard — weighted capability bars plus the full comparison
matrix behind them.

### Features
- Horizontal bar per product, sorted by weighted coverage (yes = 1, partial = 0.5, n/a excluded)
- Full matrix with level badges so every bar segment is traceable to a row
- Screen-reader summary per bar (role="img" + aria-label), no colour-only meaning
- EU / UWG §6 qualifier rendered with the data, not buried in a footnote
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import {
		CAPABILITY_MATRIX,
		LEVEL_BADGE_VARIANT,
		LEVEL_LABELS,
		MATRIX_REVIEWED_AT,
		MATRIX_SOURCE_NOTE,
		type ProductId,
		rankedCoverage
	} from './capabilities';

	/** Fill token per product column (status-shade contract: one 500 shade per role). */
	const BAR_FILL: Record<ProductId, string> = {
		svelty: 'bg-primary-500',
		competitors: 'bg-tertiary-500',
		editable: 'bg-secondary-500'
	};

	const ranking = rankedCoverage();
</script>

<div class="flex flex-col gap-4" data-testid="preview-competitive-dashboard">
	<AdminCard class="p-5">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold text-(--admin-text-body)">Competitive bar</h2>
				<p class="mt-1 text-sm text-(--admin-text-muted)">
					Weighted coverage of the nine capabilities below: yes = 1, partial = 0.5, no = 0, n/a
					excluded.
				</p>
			</div>
			<span class="text-xs text-surface-500">Reviewed {MATRIX_REVIEWED_AT}</span>
		</div>

		<ul class="mt-5 flex flex-col gap-4">
			{#each ranking as entry (entry.product.id)}
				<li>
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<span class="text-sm font-medium text-(--admin-text-body)">{entry.product.label}</span>
						<span class="text-sm tabular-nums text-(--admin-text-muted)">
							{entry.percent}%
							<span class="text-xs text-surface-500">
								({entry.counts.yes} yes · {entry.counts.partial} partial · {entry.counts.no} no{#if entry.counts.na}&nbsp;·
									{entry.counts.na} n/a{/if})
							</span>
						</span>
					</div>
					<div
						class="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-500/20"
						role="img"
						aria-label="{entry.product
							.description}: {entry.percent} percent weighted coverage, {entry.counts
							.yes} full, {entry.counts.partial} partial, {entry.counts.no} missing of {entry.counts
							.scored} scored capabilities"
					>
						<div
							class="h-full rounded-full {BAR_FILL[entry.product.id]}"
							style:width="{entry.percent}%"
						></div>
					</div>
				</li>
			{/each}
		</ul>

		<p class="mt-5 text-xs text-surface-500">{MATRIX_SOURCE_NOTE}</p>
	</AdminCard>

	<AdminCard class="p-5">
		<h2 class="text-lg font-semibold text-(--admin-text-body)">Capability matrix</h2>
		<p class="mt-1 text-sm text-(--admin-text-muted)">
			Every bar percentage is the weighted sum of these rows.
		</p>

		<div class="mt-4 overflow-x-auto">
			<table class="w-full min-w-md border-collapse text-sm">
				<caption class="sr-only">
					Live preview capability comparison between SveltyCMS, Payload, Directus, Strapi and
					Editable.website
				</caption>
				<thead>
					<tr
						class="border-b border-surface-500/30 text-xs tracking-wider uppercase text-surface-500"
					>
						<th scope="col" class="py-2 pe-3 text-start font-semibold">Capability</th>
						<th scope="col" class="px-2 py-2 text-center font-semibold">SveltyCMS</th>
						<th scope="col" class="px-2 py-2 text-center font-semibold"
							>Payload / Directus / Strapi</th
						>
						<th scope="col" class="px-2 py-2 text-center font-semibold">Editable.website</th>
					</tr>
				</thead>
				<tbody>
					{#each CAPABILITY_MATRIX as row (row.id)}
						<tr class="border-b border-surface-500/20 align-top">
							<th scope="row" class="py-2.5 pe-3 text-start font-normal">
								<span class="block font-medium text-(--admin-text-body)">{row.label}</span>
								<span class="mt-0.5 block text-xs text-(--admin-text-muted)">{row.detail}</span>
							</th>
							<td class="px-2 py-2.5 text-center">
								<Badge variant={LEVEL_BADGE_VARIANT[row.svelty]} size="sm"
									>{LEVEL_LABELS[row.svelty]}</Badge
								>
							</td>
							<td class="px-2 py-2.5 text-center">
								<Badge variant={LEVEL_BADGE_VARIANT[row.competitors]} size="sm">
									{LEVEL_LABELS[row.competitors]}
								</Badge>
							</td>
							<td class="px-2 py-2.5 text-center">
								<Badge variant={LEVEL_BADGE_VARIANT[row.editable]} size="sm"
									>{LEVEL_LABELS[row.editable]}</Badge
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>
