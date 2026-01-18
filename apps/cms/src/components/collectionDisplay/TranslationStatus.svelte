<!--
@file shared/components/src/collectionDisplay/TranslationStatus.svelte
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
	import { logger } from '@shared/utils/logger';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { publicEnv } from '@shared/stores/globalSettings.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { collection, collectionValue, mode } from '@cms/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress } from '@shared/stores/store.svelte';
	import { getFieldName } from '@shared/utils/utils';
	import { getLanguageName } from '@shared/utils/languageUtils';

	// SkeletonUI
	import { Progress, Menu, Portal } from '@skeletonlabs/skeleton-svelte';

	// ParaglideJS
	import * as m from '@shared/paraglide/messages';
	import type { Locale } from '@shared/paraglide/runtime';

	// State
	let isInitialized = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });

	// Derived values
	const availableLanguages = $derived.by(() => {
		const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (!languages || !Array.isArray(languages)) {
			return ['en'] as Locale[];
		}
		return languages as Locale[];
	});

	const currentLanguage = $derived(contentLanguage.value);
	const currentMode = $derived(mode.value);
	const isViewMode = $derived(currentMode === 'view');

	// Logic: In View Mode, only show *other* languages (switcher style). In Edit Mode, show all (status style).
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

	// Calculate language-specific progress
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

	// Helper functions
	function getProgressColor(value: number): string {
		if (value >= 80) return 'bg-primary-500';
		if (value >= 40) return 'bg-warning-500';
		return 'bg-error-500';
	}

	function getTextColor(value: number): string {
		return getProgressColor(value).replace('bg-', 'text-');
	}

	/**
	 * FIXED: Multi-field translation detection
	 * Handles complex widgets like SEO with nested language objects
	 */
	function isFieldTranslated(value: unknown): boolean {
		if (value === null || value === undefined) return false;

		// Handle string values (simple fields)
		if (typeof value === 'string') return value.trim() !== '';

		// Handle object values (complex widgets like SEO)
		// For complex widgets, value might be an object with language keys
		if (typeof value === 'object' && !Array.isArray(value)) {
			const obj = value as Record<string, any>;

			// Check if this is a language-keyed object (SEO widget pattern)
			// Look for language codes as keys (en, de, fr, etc.)
			const hasLanguageKeys = availableLanguages.some((lang) => lang in obj);

			if (hasLanguageKeys) {
				// For language-keyed objects, check if the current language has content
				const langData = obj[currentLanguage as string];
				if (!langData) return false;

				// Check if any required field in the language data has content
				// For SEO: check title and description
				if ('title' in langData && typeof langData.title === 'string') {
					return langData.title.trim() !== '';
				}
				if ('description' in langData && typeof langData.description === 'string') {
					return langData.description.trim() !== '';
				}
			}

			// For other objects, check if they have any meaningful content
			return Object.values(obj).some((v) => {
				if (typeof v === 'string') return v.trim() !== '';
				if (typeof v === 'number') return true;
				if (Array.isArray(v)) return v.length > 0;
				return false;
			});
		}

		// Handle arrays and other types
		if (Array.isArray(value)) return value.length > 0;
		return Boolean(value);
	}

	/**
	 * FIXED: Widget-aware field name generation
	 * Handles both simple and complex (multi-input) widgets
	 */
	// Updated to handle both generic widgets with simple values and multi-field widgets
	function getTranslatableFieldPath(collectionName: string, field: any): string[] {
		const baseName = `${collectionName}.${getFieldName(field)}`;
		// Check if widget has a custom path definition (Generic Architecture)
		if (field.widget?.getTranslatablePaths) {
			return field.widget.getTranslatablePaths(baseName);
		}

		// Fallback for simple widgets
		return [baseName];
	}

	// Initialize translation progress
	function initializeTranslationProgress(currentCollection: { fields: unknown[]; name?: unknown; _id?: string }): void {
		const newProgress: any = { show: false };

		for (const lang of availableLanguages) {
			newProgress[lang] = {
				total: new SvelteSet<string>(),
				translated: new SvelteSet<string>()
			};
		}

		let hasTranslatableFields = false;

		// Iterate through all fields
		for (const field of currentCollection.fields as { translated?: boolean; label: string; widget?: any }[]) {
			if (field.translated) {
				hasTranslatableFields = true;

				// Get all trackable paths for this field
				const fieldPaths = getTranslatableFieldPath(currentCollection.name as string, field);

				// Add each path to all languages
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

	/**
	 * FIXED: Multi-field progress tracking
	 * Properly handles complex widgets with nested language data
	 */
	function updateTranslationProgressFromFields(
		currentCollection: { fields: unknown[]; name?: unknown },
		currentCollectionValue: Record<string, any>
	): void {
		const newProgress = { ...translationProgress.value };
		let hasUpdates = false;

		for (const lang of availableLanguages) {
			const originalLangProgress = newProgress[lang];
			if (!originalLangProgress) continue;

			const newTranslatedSet = new SvelteSet(originalLangProgress.translated);
			let langHasUpdates = false;

			for (const field of currentCollection.fields as { translated?: boolean; label: string; widget?: any }[]) {
				if (field.translated) {
					const dbFieldName = getFieldName(field, false);
					const fieldValue = currentCollectionValue[dbFieldName];

					// Get all trackable paths for this field
					const fieldPaths = getTranslatableFieldPath(currentCollection.name as string, field);

					// Check translation status for each path
					fieldPaths.forEach((fullPath) => {
						// Extract sub-field name if present (e.g., "title" from "seo.title")
						const pathParts = fullPath.split('.');
						const subFieldName = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null;

						let valueToCheck: unknown;

						if (subFieldName && fieldValue && typeof fieldValue === 'object') {
							// For complex widgets, check the language-specific sub-field
							const langData = (fieldValue as Record<string, any>)[lang];
							valueToCheck = langData?.[subFieldName];
						} else {
							// For simple widgets, check the language-specific value
							if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
								valueToCheck = (fieldValue as Record<string, any>)[lang];
							} else {
								valueToCheck = fieldValue;
							}
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

	// Calculate overall completion totals
	function calculateCompletionTotals(): void {
		const progress = translationProgress.value;
		let total = 0;
		let translated = 0;

		for (const lang of availableLanguages) {
			const langProgress = progress[lang as Locale];
			if (!langProgress) continue;
			translated += langProgress.translated.size;
			total += langProgress.total.size;
		}

		completionTotals = { total, translated };
	}

	// Dropdown positioning handled by Skeleton Menu

	function handleLanguageChange(selectedLanguage: Locale): void {
		logger.debug('[TranslationStatus] Language change:', contentLanguage.value, '→', selectedLanguage);
		contentLanguage.set(selectedLanguage);

		// Handle View Mode Navigation (previously handleViewModeLanguageChange)
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
					const newPath = '/' + pathParts.join('/') + currentSearch;
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
				const newPath = '/' + pathParts.join('/') + window.location.search;
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

	// Effects
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

<div class="translation-status-container relative mt-1 inline-block text-left">
	<Menu>
		<Menu.Trigger
			class="btn preset-outlined-surface-500 rounded-full flex w-full items-center gap-1 p-1.5 transition-all duration-200 hover:scale-105"
			aria-label="Toggle language menu"
		>
			<span class="font-medium md:hidden">{currentLanguage.toUpperCase()}</span>
			<span class="font-medium hidden md:inline">{getLanguageName(currentLanguage)}</span>
			<iconify-icon icon="mdi:chevron-down" class="h-5 w-5 transition-transform duration-200" aria-hidden="true"></iconify-icon>
		</Menu.Trigger>

		<Portal>
			<Menu.Positioner>
				<Menu.Content
					class="card p-2 shadow-xl preset-filled-surface-100-900 z-9999 border border-surface-200 dark:border-surface-500 {showProgress &&
					!isViewMode
						? 'w-72'
						: 'w-56'}"
				>
					<div
						class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1"
					>
						{m.applayout_contentlanguage()}
					</div>

					{#each dropdownLanguages as lang (lang)}
						{@const percentage = languageProgress[lang] || 0}
						{@const isActive = currentLanguage === lang}

						<Menu.Item value={lang} onclick={() => handleLanguageChange(lang as Locale)} class={isActive ? 'bg-primary-500/20' : ''}>
							<div class="flex w-full items-center justify-between gap-2">
								<!-- Left: Language Name (Desktop) / Short Code (Mobile) -->
								<span class="font-medium transition-colors duration-200 {isActive ? 'text-primary-700 dark:text-primary-300' : ''}">
									<span class="md:hidden">{lang.toUpperCase()}</span>
									<span class="hidden md:inline">{getLanguageName(lang)}</span>
								</span>

								<!-- Right: Code, Status, Progress -->
								<div class="flex items-center gap-2">
									{#if !isViewMode && showProgress && translationProgress.value?.[lang as Locale]}
										<div class="flex w-32 items-center gap-2">
											<div class="flex-1">
												<Progress class="transition-all duration-300 h-2" value={percentage} aria-hidden="true" />
											</div>
											<span class="min-w-8 text-right text-sm font-semibold">
												{percentage}%
											</span>
										</div>
									{:else}
										<!-- View Mode: Show Code on Right -->
										<span class="hidden text-xs font-normal text-tertiary-500 dark:text-primary-500 md:inline">{lang.toUpperCase()}</span>
									{/if}

									{#if isActive}
										<span class="text-xs" aria-label="Current language">●</span>
									{/if}
								</div>
							</div>
						</Menu.Item>
					{/each}

					{#if !isViewMode && showProgress}
						<Menu.Separator />
						<div class="px-4 py-2">
							<div class="mb-1 text-center text-xs font-medium text-tertiary-500 dark:text-primary-500">
								{m.translationsstatus_completed()}
							</div>
							<div class="flex items-center justify-between gap-3">
								{#if overallPercentage}
									<div class="flex-1">
										<Progress class="transition-all duration-300 h-2" value={overallPercentage} aria-hidden="true" />
									</div>
								{/if}
								<span class="min-w-10 text-right text-sm font-bold {getTextColor(overallPercentage)}">
									{overallPercentage}%
								</span>
							</div>
						</div>
					{/if}
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<div class="mt-0.5 transition-all duration-300">
		<Progress value={overallPercentage} class="w-full rounded-full h-1" />
	</div>
</div>
