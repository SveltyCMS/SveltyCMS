<!--
@file src/components/collection-display/translation-cockpit.svelte
@component
**Unified Translation Cockpit & Multilingual Studio Inspector**

Features:
- Dual-lens language management: System (Admin UI) Language + Content Language
- Document-level translation completeness calculation across all active system languages
- Field-by-field translation deficiency detection
- 1-Click interactive field navigation (switches locale, scrolls to field, pulses focus ring)
- 1-Click AI auto-translation for individual languages and batch entire document via `/api/ai/translate`
- Status-shade design token compliance (`success`, `tertiary`, `warning`, `error`)
- Accessible WCAG AA modal container with keyboard traps and focus restoration
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Progress from '@components/ui/progress.svelte';
	import Select from '@components/ui/select.svelte';
	import { locales as bundledLocales } from '@src/paraglide/runtime';
	import type { Locale } from '@src/paraglide/runtime';
	import { collections, setCollectionValue } from '@src/stores/collection-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import {
		contentLanguage,
		systemLanguage,
		translationProgress
	} from '@src/stores/locale-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import {
		computeDocumentTranslationSummary,
		getStatusToken,
		type TranslationProgressSummary
	} from '@utils/translation-analytics';
	import { getLanguageName } from '@utils/language-utils';
	import { applySystemLanguage, mergeSystemLanguages } from '@utils/system-locale';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { getFieldName } from '@utils/schema/field-utils';
	import { logger } from '@utils/logger';
	import {
		translation_cockpit_title,
		translation_cockpit_admin_lang,
		translation_cockpit_content_readiness,
		translation_cockpit_source_lang,
		translation_cockpit_autotranslate_all,
		translation_cockpit_autotranslate_lang,
		translation_cockpit_translating,
		translation_cockpit_jump_field,
		translation_cockpit_all_complete,
		translation_cockpit_missing_fields
	} from '@src/paraglide/messages';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	// Derived document and locale state
	const currentEntry = $derived((collections.activeValue ?? {}) as Record<string, unknown>);
	const currentCollection = $derived(collections.active);
	const activeLocales = $derived.by(() => {
		const langs = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (Array.isArray(langs) && langs.length > 0) return langs as string[];
		return ['en'];
	});
	const defaultLocale = $derived(publicEnv?.DEFAULT_CONTENT_LANGUAGE ?? 'en');

	// System languages for Admin UI
	const availableSystemLangs = $derived.by(() => {
		return mergeSystemLanguages(publicEnv?.SYSTEM_LANGUAGES, bundledLocales);
	});

	const systemLangOptions = $derived(
		availableSystemLangs.map((lang: string) => ({
			value: lang,
			label: `${getLanguageName(lang as Locale)} (${lang.toUpperCase()})`
		}))
	);

	// Source Language for AI Translation (defaults to default content language)
	let sourceLanguage = $state<string>(publicEnv?.DEFAULT_CONTENT_LANGUAGE ?? 'en');

	const sourceLangOptions = $derived(
		activeLocales.map((loc) => ({
			value: loc,
			label: `${getLanguageName(loc as Locale)} (${loc.toUpperCase()})`
		}))
	);

	// Document summary calculation
	const summary: TranslationProgressSummary = $derived.by(() => {
		const fields = (currentCollection?.fields ?? []) as Array<{
			name: string;
			widget?: { translated?: boolean };
		}>;
		return computeDocumentTranslationSummary(fields, currentEntry, activeLocales, defaultLocale);
	});

	// Batch translation state
	let isBatchTranslating = $state(false);
	let translatingTargetLocale = $state<string | null>(null);
	let translationStatusText = $state<string>('');

	function handleSwitchLanguage(locale: string) {
		contentLanguage.set(locale as Locale);
		open = false;
	}

	function handleSystemLanguageChange(newLang: string) {
		if (!newLang) return;
		systemLanguage.set(newLang);
		applySystemLanguage(newLang);
		toast.info(`Switched admin interface to ${getLanguageName(newLang as Locale)}`);
	}

	function handleJumpToField(locale: string, fieldName: string) {
		contentLanguage.set(locale as Locale);
		open = false;
		setTimeout(() => {
			const el = document.getElementById(`field-container-${fieldName}`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				el.classList.add(
					'ring-4',
					'ring-primary-500/50',
					'rounded-xl',
					'transition-all',
					'duration-500'
				);
				setTimeout(() => {
					el.classList.remove('ring-4', 'ring-primary-500/50');
				}, 2500);
				toast.info(`Switched to ${locale.toUpperCase()} — Editing "${fieldName}"`);
			}
		}, 120);
	}

	async function translateFieldsForLocale(targetLocale: string): Promise<number> {
		if (!currentCollection?.fields || !currentEntry) return 0;
		const translatableFields = currentCollection.fields.filter(
			(f: any) => f.translated === true || f.widget?.translated === true
		);

		let count = 0;
		for (const field of translatableFields) {
			const fieldName = getFieldName(field, false);
			const fieldLabel = (field as any).label || fieldName;

			// Check if already translated in targetLocale
			const val = currentEntry[fieldName];
			let isAlreadyTranslated = false;
			if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
				const localized = (val as Record<string, unknown>)[targetLocale];
				if (typeof localized === 'string' && localized.trim().length > 0) {
					isAlreadyTranslated = true;
				}
			}
			if (isAlreadyTranslated) continue;

			// Extract source text
			let sourceText = '';
			if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
				sourceText = String((val as Record<string, unknown>)[sourceLanguage] || '');
			} else if (typeof val === 'string' && sourceLanguage === defaultLocale) {
				sourceText = val;
			}
			if (!sourceText.trim()) continue;

			translationStatusText = `Translating "${fieldLabel}" to ${targetLocale.toUpperCase()}...`;

			try {
				const res = await fetch('/api/ai/translate', {
					method: 'POST',
					headers: clientJsonHeaders(),
					body: JSON.stringify({
						text: sourceText,
						sourceLang: sourceLanguage,
						targetLang: targetLocale,
						field: fieldLabel,
						collection: currentCollection?.name || 'unknown'
					})
				});

				if (!res.ok) {
					logger.warn(`[Cockpit] Translation failed for ${fieldName} (${res.status})`);
					continue;
				}

				const data = await res.json();
				if (data.translatedText) {
					let fieldValue = currentEntry[fieldName];
					if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
						fieldValue = { ...(fieldValue as Record<string, unknown>) };
					} else {
						fieldValue = { [sourceLanguage]: typeof fieldValue === 'string' ? fieldValue : '' };
					}
					(fieldValue as Record<string, unknown>)[targetLocale] = data.translatedText;
					currentEntry[fieldName] = fieldValue;

					const fieldPath = `${currentCollection?.name}.${fieldName}`;
					translationProgress.markFieldTranslated(targetLocale, fieldPath);
					count++;
				}
			} catch (err) {
				logger.error(`[Cockpit] Error translating field ${fieldName}:`, err);
			}
		}

		if (count > 0) {
			setCollectionValue({ ...currentEntry });
		}
		return count;
	}

	async function handleAutoTranslateLanguage(targetLocale: string) {
		if (isBatchTranslating) return;
		isBatchTranslating = true;
		translatingTargetLocale = targetLocale;
		translationStatusText = `Starting translation into ${targetLocale.toUpperCase()}...`;

		try {
			const count = await translateFieldsForLocale(targetLocale);
			if (count > 0) {
				toast.success(
					`Translated ${count} field${count === 1 ? '' : 's'} into ${getLanguageName(targetLocale as Locale)}`
				);
			} else {
				toast.info(`No missing fields with ${sourceLanguage.toUpperCase()} source text found`);
			}
		} catch (err) {
			toast.error('Batch translation encountered an error');
		} finally {
			isBatchTranslating = false;
			translatingTargetLocale = null;
			translationStatusText = '';
		}
	}

	async function handleAutoTranslateAll() {
		if (isBatchTranslating) return;
		isBatchTranslating = true;
		translatingTargetLocale = 'all';
		translationStatusText = 'Starting global auto-translation...';

		let totalCount = 0;
		const targetLocales = activeLocales.filter((l) => l !== sourceLanguage);

		try {
			for (const loc of targetLocales) {
				const count = await translateFieldsForLocale(loc);
				totalCount += count;
			}

			if (totalCount > 0) {
				toast.success(`Completed auto-translation: ${totalCount} fields updated`);
			} else {
				toast.info(
					`No missing translations found for available ${sourceLanguage.toUpperCase()} content`
				);
			}
		} catch (err) {
			toast.error('Global auto-translation encountered an error');
		} finally {
			isBatchTranslating = false;
			translatingTargetLocale = null;
			translationStatusText = '';
		}
	}
</script>

<Modal bind:open title={translation_cockpit_title()} size="lg" color="surface">
	<div class="space-y-6 p-1">
		<!-- Dual-Lens Language Control Bar -->
		<div
			class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-surface-500/10 border border-surface-500/30"
		>
			<!-- Lens 1: Admin Interface (systemLanguage) -->
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:monitor-dashboard" class="text-primary-500" width="18"
					></iconify-icon>
					<span
						class="text-xs font-bold uppercase tracking-wider text-surface-600 dark:text-surface-400"
					>
						{translation_cockpit_admin_lang()}
					</span>
				</div>
				<Select
					id="cockpit-system-language"
					size="sm"
					value={systemLanguage.value}
					options={systemLangOptions}
					onchange={handleSystemLanguageChange}
				/>
			</div>

			<!-- Lens 2: AI Translation Source Language -->
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:translate" class="text-tertiary-500" width="18"></iconify-icon>
					<span
						class="text-xs font-bold uppercase tracking-wider text-surface-600 dark:text-surface-400"
					>
						{translation_cockpit_source_lang()}
					</span>
				</div>
				<Select
					id="cockpit-source-language"
					size="sm"
					bind:value={sourceLanguage}
					options={sourceLangOptions}
				/>
			</div>
		</div>

		<!-- Executive Content Health Banner -->
		<div
			class="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-surface-500/10 border border-surface-500/30"
		>
			<div class="flex items-center gap-3">
				<div
					class="w-12 h-12 rounded-xl flex items-center justify-center bg-primary-500/10 text-primary-500 border border-primary-500/30 shrink-0"
				>
					<iconify-icon icon="mdi:translate-variant" width="28"></iconify-icon>
				</div>
				<div>
					<h4 class="font-bold text-base text-surface-900 dark:text-surface-100">
						{translation_cockpit_content_readiness()}
					</h4>
					<p class="text-xs text-surface-600 dark:text-surface-400">
						Tracking {summary.translatableFieldsCount} translatable fields across {activeLocales.length}
						active languages.
					</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<div class="text-end">
					<div class="text-2xl font-black text-surface-900 dark:text-surface-100 leading-none">
						{summary.overallProgress}%
					</div>
					<div class="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
						Global Readiness
					</div>
				</div>

				{#if summary.overallProgress < 100}
					<Button
						variant="primary"
						size="sm"
						class="flex items-center gap-1.5 text-xs font-semibold shadow-sm"
						disabled={isBatchTranslating}
						onclick={handleAutoTranslateAll}
					>
						{#if isBatchTranslating && translatingTargetLocale === 'all'}
							<iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
						{:else}
							<iconify-icon icon="mdi:auto-fix" width="16"></iconify-icon>
						{/if}
						{translation_cockpit_autotranslate_all()}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Live Translation Status Notification -->
		{#if isBatchTranslating}
			<div
				class="p-3 rounded-lg bg-primary-500/10 border border-primary-500/30 flex items-center gap-2.5 text-xs font-medium text-primary-600 dark:text-primary-400 animate-pulse"
			>
				<iconify-icon icon="mdi:loading" class="animate-spin text-primary-500 shrink-0" width="18"
				></iconify-icon>
				<span>{translationStatusText || translation_cockpit_translating()}</span>
			</div>
		{/if}

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
					{@const isSource = sourceLanguage === locale}
					{@const langName = getLanguageName(locale as Locale)}
					{@const isThisTranslating = isBatchTranslating && translatingTargetLocale === locale}

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
									<div class="flex items-center gap-2 flex-wrap">
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
										{#if isSource}
											<span
												class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-tertiary-500/20 text-tertiary-500 border border-tertiary-500/30"
											>
												Source
											</span>
										{/if}
									</div>
									<div class="text-xs text-surface-600 dark:text-surface-400">
										{#if missing.length === 0}
											<span class="text-success-500 font-medium"
												>{translation_cockpit_all_complete()}</span
											>
										{:else}
											<span class="text-surface-600 dark:text-surface-400">
												{translation_cockpit_missing_fields({ count: missing.length })}
											</span>
										{/if}
									</div>
								</div>
							</div>

							<div class="flex items-center gap-2 shrink-0">
								<span class="text-sm font-bold {token.textClass} me-2">{progress}%</span>

								{#if missing.length > 0 && !isSource}
									<Button
										variant="secondary"
										size="sm"
										class="text-xs flex items-center gap-1"
										disabled={isBatchTranslating}
										onclick={() => handleAutoTranslateLanguage(locale)}
									>
										{#if isThisTranslating}
											<iconify-icon icon="mdi:loading" class="animate-spin" width="14"
											></iconify-icon>
										{:else}
											<iconify-icon icon="mdi:auto-fix" width="14"></iconify-icon>
										{/if}
										{translation_cockpit_autotranslate_lang()}
									</Button>
								{/if}

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

						<!-- Missing Fields Interactive Chip List -->
						{#if missing.length > 0}
							<div class="pt-2 border-t border-surface-500/20 flex flex-wrap items-center gap-1.5">
								<span class="text-[11px] font-semibold text-surface-500 me-1">Missing:</span>
								{#each missing as fieldName (fieldName)}
									<button
										type="button"
										onclick={() => handleJumpToField(locale, fieldName)}
										class="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-surface-500/10 text-surface-600 dark:text-surface-400 border border-surface-500/30 hover:border-primary-500 hover:text-primary-500 hover:bg-primary-500/10 transition-colors flex items-center gap-1"
										title="{translation_cockpit_jump_field()}: {fieldName}"
										aria-label="{translation_cockpit_jump_field()} {fieldName}"
									>
										<span>{fieldName}</span>
										<iconify-icon icon="mdi:arrow-top-right" width="10" aria-hidden="true"
										></iconify-icon>
									</button>
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
