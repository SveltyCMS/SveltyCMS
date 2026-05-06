<!--
@file src/components/translation-status.svelte
@component
**Translation status component for displaying translation progress per language.**

FIXES:
1. Multi-field support - tracks all translatable fields in a collection
2. Widget-aware - properly handles widgets with multiple inputs (like SEO)
3. Field-level granularity - individual field progress tracking

@example
<TranslationStatus />
-->

<script lang="ts">
	import ProgressBar from '@src/components/system/progress-bar.svelte';
	import { applayout_contentlanguage, translationsstatus_completed } from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { collection, collectionValue, mode } from '@src/stores/collection-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { contentLanguage, translationProgress } from '@src/stores/store.svelte';
	import { getLanguageName } from '@utils/language-utils';
	import { logger } from '@utils/logger';
	import { getFieldName } from '@utils/utils';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let isInitialized = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });
	let languageMenuOpen = $state(false);

	const languageMenuId = 'translation-status-language-menu';

	const availableLanguages = $derived.by(() => {
		const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (!(languages && Array.isArray(languages))) {
			return ['en'] as Locale[];
		}
		return languages as Locale[];
	});

	const currentLanguage = $derived(contentLanguage.value);
	const currentMode = $derived(mode.value);
	const isViewMode = $derived(currentMode === 'view');

	const dropdownLanguages = $derived.by(() => {
		if (isViewMode) {
			return availableLanguages.filter((l) => l !== currentLanguage);
		}
		return availableLanguages;
	});

	const overallPercentage = $derived.by(() => {
		const { total, translated } = completionTotals;
		return total > 0 ? Math.round((translated / total) * 100) : 0;
	});

	const showProgress = $derived(translationProgress.value?.show || completionTotals.total > 0);

	const languageProgress = $derived.by(() => {
		const progress: Record<string, number> = {};
		const currentProgress = translationProgress.value;

		for (const lang of availableLanguages) {
			const langProgress = currentProgress?.[lang as Locale];
			if (langProgress && langProgress.total.size > 0) {
				progress[lang] = Math.round((langProgress.translated.size / langProgress.total.size) * 100);
			} else {
				progress[lang] = 0;
			}
		}

		return progress;
	});

	function toggleLanguageMenu() {
		languageMenuOpen = !languageMenuOpen;
	}

	function closeLanguageMenu() {
		languageMenuOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeLanguageMenu();
		}
	}

	function getProgressVariant(value: number): 'primary' | 'warning' | 'error' {
		if (value >= 80) {
			return 'primary';
		}
		if (value >= 40) {
			return 'warning';
		}
		return 'error';
	}

	function getTextColor(value: number): string {
		return `text-${getProgressVariant(value)}-500`;
	}

	function isFieldTranslated(value: unknown): boolean {
		if (value === null || value === undefined) {
			return false;
		}

		if (typeof value === 'string') {
			return value.trim() !== '';
		}

		if (typeof value === 'object' && !Array.isArray(value)) {
			const obj = value as Record<string, any>;
			const hasLanguageKeys = availableLanguages.some((lang) => lang in obj);

			if (hasLanguageKeys) {
				const langData = obj[currentLanguage as string];
				if (!langData) {
					return false;
				}

				if ('title' in langData && typeof langData.title === 'string') {
					return langData.title.trim() !== '';
				}
				if ('description' in langData && typeof langData.description === 'string') {
					return langData.description.trim() !== '';
				}
			}

			return Object.values(obj).some((v) => {
				if (typeof v === 'string') {
					return v.trim() !== '';
				}
				if (typeof v === 'number') {
					return true;
				}
				if (Array.isArray(v)) {
					return v.length > 0;
				}
				return false;
			});
		}

		if (Array.isArray(value)) {
			return value.length > 0;
		}

		return Boolean(value);
	}

	function getTranslatableFieldPath(collectionName: string, field: any): string[] {
		const baseName = `${collectionName}.${getFieldName(field)}`;

		if (field.widget?.getTranslatablePaths) {
			return field.widget.getTranslatablePaths(baseName);
		}

		return [baseName];
	}

	function initializeTranslationProgress(currentCollection: { fields: unknown[]; name?: unknown; _id?: string }): void {
		const newProgress: typeof translationProgress.value = { show: false };

		for (const lang of availableLanguages) {
			newProgress[lang] = {
				total: new SvelteSet<string>(),
				translated: new SvelteSet<string>()
			};
		}

		let hasTranslatableFields = false;

		for (const field of currentCollection.fields as {
			translated?: boolean;
			label: string;
			widget?: any;
		}[]) {
			if (field.translated) {
				hasTranslatableFields = true;

				const fieldPaths = getTranslatableFieldPath(currentCollection.name as string, field);

				for (const lang of availableLanguages) {
					fieldPaths.forEach((path) => {
						newProgress[lang]?.total.add(path);
					});
				}
			}
		}

		newProgress.show = hasTranslatableFields;
		translationProgress.value = newProgress;
	}

	function updateTranslationProgressFromFields(
		currentCollection: { fields: unknown[]; name?: unknown },
		currentCollectionValue: Record<string, any>
	): void {
		const newProgress = { ...translationProgress.value };
		let hasUpdates = false;

		for (const lang of availableLanguages) {
			const originalLangProgress = newProgress[lang];
			if (!originalLangProgress) {
				continue;
			}

			const newTranslatedSet = new SvelteSet(originalLangProgress.translated);
			let langHasUpdates = false;

			for (const field of currentCollection.fields as {
				translated?: boolean;
				label: string;
				widget?: any;
			}[]) {
				if (field.translated) {
					const dbFieldName = getFieldName(field, false);
					const fieldValue = currentCollectionValue[dbFieldName];

					const fieldPaths = getTranslatableFieldPath(currentCollection.name as string, field);

					fieldPaths.forEach((fullPath) => {
						const pathParts = fullPath.split('.');
						const subFieldName = pathParts.length > 2 ? pathParts.at(-1) : null;

						let valueToCheck: unknown;

						if (subFieldName && fieldValue && typeof fieldValue === 'object') {
							const langData = (fieldValue as Record<string, any>)[lang];
							valueToCheck = langData?.[subFieldName];
						} else if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
							valueToCheck = (fieldValue as Record<string, any>)[lang];
						} else {
							valueToCheck = fieldValue;
						}

						const isTranslated = isFieldTranslated(valueToCheck);
						const wasTranslated = originalLangProgress.translated.has(fullPath);

						if (isTranslated && !wasTranslated) {
							newTranslatedSet.add(fullPath);
							langHasUpdates = true;
						} else if (!isTranslated && wasTranslated) {
							newTranslatedSet.delete(fullPath);
							langHasUpdates = true;
						}
					});
				}
			}

			if (langHasUpdates) {
				newProgress[lang] = {
					...originalLangProgress,
					translated: newTranslatedSet
				};
				hasUpdates = true;
			}
		}

		if (hasUpdates) {
			translationProgress.value = newProgress;
			calculateCompletionTotals();
		}
	}

	function calculateCompletionTotals(): void {
		const progress = translationProgress.value;
		let total = 0;
		let translated = 0;

		for (const lang of availableLanguages) {
			const langProgress = progress[lang as Locale];
			if (!langProgress) {
				continue;
			}
			translated += langProgress.translated.size;
			total += langProgress.total.size;
		}

		completionTotals = { total, translated };
	}

	function handleLanguageChange(selectedLanguage: Locale): void {
		logger.debug('[TranslationStatus] Language change:', contentLanguage.value, '→', selectedLanguage);
		contentLanguage.set(selectedLanguage);
		closeLanguageMenu();

		if (isViewMode) {
			const currentCollectionId = collection.value?._id;
			const currentSearch = page.url.search;

			if (currentCollectionId) {
				const newPath = `/${selectedLanguage}/${currentCollectionId}${currentSearch}`;
				goto(newPath, { replaceState: false, invalidateAll: true });
			} else {
				const currentPath = page.url.pathname;
				const pathParts = currentPath.split('/').filter(Boolean);
				if (pathParts.length > 0) {
					pathParts[0] = selectedLanguage;
					const newPath = `/${pathParts.join('/')}${currentSearch}`;
					goto(newPath, { replaceState: false, invalidateAll: true });
				}
			}
			return;
		}

		if (typeof window !== 'undefined') {
			const currentPath = window.location.pathname;
			const pathParts = currentPath.split('/').filter(Boolean);

			if (pathParts.length > 0) {
				pathParts[0] = selectedLanguage;
				const newPath = `/${pathParts.join('/')}${window.location.search}`;
				window.history.replaceState({}, '', newPath);
				logger.debug('[TranslationStatus] Updated URL to:', newPath);
			}

			const customEvent = new CustomEvent('languageChanged', {
				detail: { language: selectedLanguage },
				bubbles: true
			});
			window.dispatchEvent(customEvent);
			logger.debug('[TranslationStatus] Dispatched languageChanged event');
		}
	}

	let lastEntryId = $state<string | undefined>(undefined);
	let lastCollectionId = $state<string | undefined>(undefined);

	$effect(() => {
		const currentCollection = collection.value;
		const currentEntry = collectionValue.value as { _id?: string } | undefined;
		const entryId = currentEntry?._id;
		const collectionId = currentCollection?._id;

		const collectionChanged = collectionId !== lastCollectionId;
		const entryChanged = entryId !== lastEntryId;

		if (currentCollection?.fields && (collectionChanged || entryChanged)) {
			logger.debug('[TranslationStatus] Initializing translation progress', {
				collectionId,
				entryId,
				collectionChanged,
				entryChanged,
				mode: entryId ? 'edit' : 'create'
			});

			untrack(() => {
				isInitialized = false;
				initializeTranslationProgress(currentCollection);

				if (entryId && currentEntry && Object.keys(currentEntry).length > 0) {
					updateTranslationProgressFromFields(currentCollection, currentEntry);
				} else {
					calculateCompletionTotals();
				}

				isInitialized = true;
				lastEntryId = entryId;
				lastCollectionId = collectionId;
			});
		}
	});

	let lastCollectionValueStr = $state<string>('');
	$effect(() => {
		const currentCollection = collection.value;
		const currentCollectionValue = collectionValue.value as Record<string, any>;

		if (currentCollection?.fields && currentCollectionValue && Object.keys(currentCollectionValue).length > 0 && isInitialized) {
			const currentStr = JSON.stringify(currentCollectionValue);
			if (currentStr !== lastCollectionValueStr) {
				logger.debug('[TranslationStatus] Collection value changed, updating progress');
				updateTranslationProgressFromFields(currentCollection, currentCollectionValue);
				lastCollectionValueStr = currentStr;
			}
		}
	});
</script>

<svelte:window onclick={closeLanguageMenu} onkeydown={handleWindowKeydown} />

<div class="translation-status-container relative mt-1 inline-block text-left">
	<button
		type="button"
		class="btn preset-outlined-surface-500 flex w-full items-center gap-1 rounded-full p-1.5 transition-all duration-200 hover:scale-105"
		aria-label="Toggle language menu"
		aria-haspopup="menu"
		aria-expanded={languageMenuOpen}
		aria-controls={languageMenuId}
		onclick={(event) => {
			event.stopPropagation();
			toggleLanguageMenu();
		}}
	>
		<span class="font-medium md:hidden">{currentLanguage.toUpperCase()}</span>
		<span class="hidden font-medium md:inline">{getLanguageName(currentLanguage)}</span>
		<iconify-icon
			icon="mdi:chevron-down"
			class="h-5 w-5 transition-transform duration-200 {languageMenuOpen ? 'rotate-180' : ''}"
			aria-hidden="true"
		></iconify-icon>
	</button>

	{#if languageMenuOpen}
		<div
			id={languageMenuId}
			role="menu"
			class="card preset-filled-surface-100-900 absolute right-0 z-9999 mt-2 border border-surface-200 p-2 shadow-xl dark:border-surface-500 {showProgress &&
			!isViewMode
				? 'w-72'
				: 'w-56'}"
		>
			<div
				class="mb-1 border-b border-surface-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-tertiary-500 dark:border-surface-50 dark:text-primary-500"
			>
				{applayout_contentlanguage()}
			</div>

			{#each dropdownLanguages as lang (lang)}
				{@const percentage = languageProgress[lang] || 0}
				{@const isActive = currentLanguage === lang}

				<button
					type="button"
					role="menuitem"
					onclick={() => handleLanguageChange(lang as Locale)}
					class="w-full rounded px-3 py-2 text-left transition-colors hover:bg-surface-200 dark:hover:bg-surface-700 {isActive ? 'bg-primary-500/20' : ''}"
				>
					<div class="flex w-full items-center justify-between gap-2">
						<span class="font-medium transition-colors duration-200 {isActive ? 'text-primary-700 dark:text-primary-300' : ''}">
							<span class="md:hidden">{lang.toUpperCase()}</span>
							<span class="hidden md:inline">{getLanguageName(lang)}</span>
						</span>

						<div class="flex items-center gap-2">
							{#if !isViewMode && showProgress && translationProgress.value?.[lang as Locale]}
								<div class="flex w-32 items-center gap-2">
									<div class="flex-1">
										<ProgressBar value={percentage} color={getProgressVariant(percentage)} size="sm" showPercentage={false} animated={false} />
									</div>
									<span class="min-w-8 text-right text-sm font-semibold"> {percentage}% </span>
								</div>
							{:else}
								<span class="hidden text-xs font-normal text-tertiary-500 dark:text-primary-500 md:inline">{lang.toUpperCase()}</span>
							{/if}

							{#if isActive}
								<span class="text-xs" aria-label="Current language">●</span>
							{/if}
						</div>
					</div>
				</button>
			{/each}

			{#if !isViewMode && showProgress}
				<div class="my-1 h-px bg-surface-200 dark:bg-surface-600"></div>
				<div class="px-4 py-2">
					<div class="mb-1 text-center text-xs font-medium text-tertiary-500 dark:text-primary-500">{translationsstatus_completed()}</div>
					<div class="flex items-center justify-between gap-3">
						{#if overallPercentage}
							<div class="flex-1">
								<ProgressBar value={overallPercentage} color={getProgressVariant(overallPercentage)} size="sm" showPercentage={false} animated={false} />
							</div>
						{/if}
						<span class="min-w-10 text-right text-sm font-bold {getTextColor(overallPercentage)}"> {overallPercentage}% </span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="mt-0.5 transition-all duration-300"><!-- External progress bar removed to prevent header overflow --></div>
</div>