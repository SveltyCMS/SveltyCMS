<!--
@file src/components/collection-display/translation-cockpit.svelte
@component
**Interactive Translation Cockpit & Multilingual Health Inspector**

Features:
- Document-level translation completeness calculation across all active system languages
- Field-by-field translation deficiency detection (highlights missing translated fields per language)
- 1-Click language switching into untranslated inputs
- Status-shade design token compliance (`success`, `tertiary`, `warning`, `error`)
- Accessible WCAG AA modal container with keyboard traps and focus restoration
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Progress from '@components/ui/progress.svelte';
	import type { Locale } from '@src/paraglide/runtime';
	import { collection, collectionValue } from '@src/stores/collection-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	import {
		computeDocumentTranslationSummary,
		getStatusToken,
		type TranslationProgressSummary,
	} from '@utils/translation-analytics';
	import { getLanguageName } from '@utils/language-utils';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	// Derived state
	const currentEntry = $derived((collectionValue.value ?? {}) as Record<string, unknown>);
	const currentCollection = $derived(collection.value);
	const activeLocales = $derived.by(() => {
		const langs = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (Array.isArray(langs) && langs.length > 0) return langs as string[];
		return ['en'];
	});
	const defaultLocale = $derived(publicEnv?.DEFAULT_CONTENT_LANGUAGE ?? 'en');

	const summary: TranslationProgressSummary = $derived.by(() => {
		const fields = (currentCollection?.fields ?? []) as Array<{
			name: string;
			widget?: { translated?: boolean };
		}>;
		return computeDocumentTranslationSummary(fields, currentEntry, activeLocales, defaultLocale);
	});

	function handleSwitchLanguage(locale: string) {
		contentLanguage.set(locale as Locale);
		open = false;
	}
</script>

<Modal bind:open title="Translation Cockpit" size="lg" color="surface">
	<div class="space-y-6 p-1">
		<!-- Executive Summary Header -->
		<div
			class="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-surface-500/10 border border-surface-500/30"
		>
			<div class="flex items-center gap-3">
				<div
					class="w-12 h-12 rounded-xl flex items-center justify-center bg-primary-500/10 text-primary-500 border border-primary-500/30 shrink-0"
				>
					<iconify-icon icon="mdi:translate" width="28"></iconify-icon>
				</div>
				<div>
					<h4 class="font-bold text-base text-surface-900 dark:text-surface-100">
						Multilingual Content Health
					</h4>
					<p class="text-xs text-surface-600 dark:text-surface-400">
						Tracking {summary.translatableFieldsCount} translatable fields across {activeLocales.length} active languages.
					</p>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<div class="text-end">
					<div class="text-2xl font-black text-surface-900 dark:text-surface-100 leading-none">
						{summary.overallProgress}%
					</div>
					<div class="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
						Global Readiness
					</div>
				</div>
			</div>
		</div>

		<!-- Per-Language Progress Cards -->
		<div class="space-y-3">
			<h5 class="text-xs font-bold uppercase tracking-wider text-surface-500">
				Language Status & Deficiencies
			</h5>

			<div class="grid grid-cols-1 gap-3">
				{#each activeLocales as locale (locale)}
					{@const progress = summary.byLocale[locale] ?? 0}
					{@const missing = summary.missingFieldsByLocale[locale] ?? []}
					{@const token = getStatusToken(progress)}
					{@const isCurrent = contentLanguage.value === locale}
					{@const langName = getLanguageName(locale as Locale)}

					<div
						class="p-4 rounded-xl border transition-all duration-150 {token.borderClass} {token.bgClass} flex flex-col gap-3"
					>
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-3 min-w-0">
								<span
									class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase shrink-0 border {token.borderClass} {token.textClass} bg-surface-500/10 dark:bg-surface-900"
								>
									{locale}
								</span>
								<div class="min-w-0">
									<div class="flex items-center gap-2">
										<span class="font-bold text-sm text-surface-900 dark:text-surface-100 truncate">
											{langName}
										</span>
										{#if isCurrent}
											<span
												class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-primary-500/20 text-primary-500 border border-primary-500/30"
											>
												Active in Editor
											</span>
										{/if}
									</div>
									<div class="text-xs text-surface-600 dark:text-surface-400">
										{#if missing.length === 0}
											<span class="text-success-500 font-medium">All translatable fields complete</span>
										{:else}
											<span class="text-surface-600 dark:text-surface-400">
												{missing.length} {missing.length === 1 ? 'field' : 'fields'} missing translation
											</span>
										{/if}
									</div>
								</div>
							</div>

							<div class="flex items-center gap-3 shrink-0">
								<span class="text-sm font-bold {token.textClass}">{progress}%</span>
								{#if !isCurrent}
									<Button
										variant="outline"
										size="sm"
										class="text-xs"
										onclick={() => handleSwitchLanguage(locale)}
									>
										Translate
									</Button>
								{/if}
							</div>
						</div>

						<Progress value={progress} color={token.badgeVariant} height="h-2" />

						<!-- Missing Fields Chip List -->
						{#if missing.length > 0}
							<div class="pt-2 border-t border-surface-500/20 flex flex-wrap items-center gap-1.5">
								<span class="text-[11px] font-semibold text-surface-500 me-1">Missing:</span>
								{#each missing as fieldName (fieldName)}
									<span
										class="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-surface-500/10 text-surface-600 dark:text-surface-400 border border-surface-500/30"
									>
										{fieldName}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	{#snippet footer()}
		<div class="flex items-center justify-end w-full">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</div>
	{/snippet}
</Modal>
