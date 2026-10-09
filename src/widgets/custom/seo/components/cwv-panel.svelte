<!--
@file src/widgets/custom/seo/components/cwv-panel.svelte
@component Core Web Vitals readout for the SEO widget's Advanced tab.

Measures the canonical URL on demand through the Google PageSpeed Insights API
(no API key required) and shows field data (CrUX — real Chrome users,
origin-level, 28-day rolling, p75) and lab data (Lighthouse simulation of this
URL) for LCP / INP / CLS, color-coded by the Web Vitals thresholds.

@props
- url (string): The public URL to measure — typically the entry's canonical URL.
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import {
		seo_cwv_heading,
		seo_cwv_intro,
		seo_cwv_lab_data,
		seo_cwv_lab_measurement,
		seo_cwv_measure_cta,
		seo_cwv_measuring,
		seo_cwv_no_field_data,
		seo_cwv_set_canonical_hint,
		seo_cwv_webdev_link,
		seo_cwv_field_data
	} from '@src/paraglide/messages';
	import { rethrow } from '@utils/error-handling';
	import { isAbsoluteHttpUrl, parsePsiReport, type CwvRating, type CwvReport } from '../cwv';

	interface Props {
		url?: string;
	}

	let { url = '' }: Props = $props();

	let report = $state<CwvReport | null>(null);
	let isLoading = $state(false);
	let error = $state('');

	const measurable = $derived(isAbsoluteHttpUrl(url.trim()));

	const ratingClasses = (rating: CwvRating) =>
		rating === 'good'
			? 'border-success-500/30 bg-success-500/10 text-success-500 dark:text-success-400'
			: rating === 'needs-improvement'
				? 'border-warning-500/30 bg-warning-500/10 text-warning-500 dark:text-warning-400'
				: 'border-error-500/30 bg-error-500/10 text-error-500 dark:text-error-400';

	const ratingLabel = (rating: CwvRating) =>
		rating === 'good' ? 'Good' : rating === 'needs-improvement' ? 'Needs improvement' : 'Poor';

	async function measure() {
		if (!measurable || isLoading) return;
		isLoading = true;
		error = '';
		try {
			const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
			api.searchParams.set('url', url.trim());
			api.searchParams.set('category', 'performance');
			api.searchParams.set('strategy', 'mobile');
			const response = await fetch(api.toString());
			if (!response.ok) throw new Error(`PageSpeed Insights returned HTTP ${response.status}`);
			const json: unknown = await response.json();
			report = parsePsiReport(json, url.trim(), 'mobile');
		} catch (err) {
			rethrow(err);
			logger.debug('[seo:cwv] PageSpeed Insights measurement failed', { error: err });
			error =
				'Measurement failed — the page may not be reachable from Google, or the API quota is exhausted. Try again later.';
			report = null;
		} finally {
			isLoading = false;
		}
	}
</script>

<section
	class="space-y-3 rounded-lg border border-surface-500/30 p-4"
	aria-labelledby="seo-cwv-heading"
>
	<h3 id="seo-cwv-heading" class="flex items-center gap-2 text-sm font-bold">
		<iconify-icon icon="mdi:speedometer" width="24"></iconify-icon>
		{seo_cwv_heading()}
	</h3>
	<p class="text-xs text-surface-500">
		{seo_cwv_intro()}
	</p>

	{#if !measurable}
		<p class="text-xs text-surface-500">{seo_cwv_set_canonical_hint()}</p>
	{:else}
		<button
			type="button"
			class="preset-filled-primary-500 rounded px-3 py-1.5 text-sm font-medium shadow-xs"
			onclick={measure}
			disabled={isLoading}
		>
			{#if isLoading}
				{seo_cwv_measuring()}
			{:else}
				{seo_cwv_measure_cta()}
			{/if}
		</button>
	{/if}

	{#if error}
		<p class="text-xs text-error-500 dark:text-error-400" role="alert">{error}</p>
	{/if}

	{#if report}
		{#if report.field && report.field.length > 0}
			<div class="space-y-2">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">
					{seo_cwv_field_data()}
				</h4>
				<ul class="space-y-2">
					{#each report.field as reading (reading.metric)}
						<li
							class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-500/20 p-3"
						>
							<span class="text-sm">{reading.label}</span>
							<span class="flex items-center gap-2">
								<span class="text-sm font-semibold tabular-nums">{reading.display}</span>
								<span
									class="rounded border px-2 py-0.5 text-xs font-medium {ratingClasses(
										reading.rating
									)}"
								>
									{ratingLabel(reading.rating)}
								</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<p class="text-xs text-surface-500">
				{seo_cwv_no_field_data()}
			</p>
		{/if}

		{#if report.lab && report.lab.length > 0}
			<div class="space-y-2">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">
					{seo_cwv_lab_data()}
				</h4>
				<ul class="space-y-2">
					{#each report.lab as reading (reading.metric)}
						<li
							class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-500/20 p-3"
						>
							<span class="text-sm">{reading.label}</span>
							<span class="flex items-center gap-2">
								<span class="text-sm font-semibold tabular-nums">{reading.display}</span>
								<span
									class="rounded border px-2 py-0.5 text-xs font-medium {ratingClasses(
										reading.rating
									)}"
								>
									{ratingLabel(reading.rating)}
								</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if report.labMeasuredAt}
			<p class="text-xs text-surface-400">
				{seo_cwv_lab_measurement({
					timestamp: report.labMeasuredAt.slice(0, 16).replace('T', ' ')
				})}{' '}
				<a href="https://web.dev/vitals/" class="text-tertiary-500 underline"
					>{seo_cwv_webdev_link()}</a
				>
			</p>
		{/if}
	{/if}
</section>
