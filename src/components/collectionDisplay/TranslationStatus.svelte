<!--
@file src/components/TranslationStatus.svelte
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
	import { logger } from '@utils/logger';
	import { untrack, onMount, onDestroy } from 'svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import { collection, collectionValue, mode } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import * as m from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { scale, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// Portal container for dropdown
	let portalTarget = $state<HTMLElement | null>(null);

	onMount(() => {
		if (typeof document !== 'undefined') {
			portalTarget = document.createElement('div');
			portalTarget.id = 'translation-dropdown-portal';
			portalTarget.style.position = 'fixed';
			portalTarget.style.zIndex = '99999';
			portalTarget.style.pointerEvents = 'none';
			document.body.appendChild(portalTarget);
		}
	});

	onDestroy(() => {
		if (portalTarget && portalTarget.parentNode) {
			portalTarget.parentNode.removeChild(portalTarget);
		}
	});

	// State
	let isOpen = $state(false);
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
		const newProgress: typeof translationProgress.value = { show: false };

		for (const lang of availableLanguages) {
			newProgress[lang] = {
				total: new Set<string>(),
				translated: new Set<string>()
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

			const newTranslatedSet = new Set(originalLangProgress.translated);
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

	// Dropdown position state
	let dropdownPosition = $state({ top: 0, right: 0 });

	function updateDropdownPosition(): void {
		const button = document.querySelector('.translation-status-container button');
		if (button) {
			const rect = button.getBoundingClientRect();
			dropdownPosition = {
				top: rect.bottom + 8,
				right: window.innerWidth - rect.right
			};
		}
	}

	// Event handlers
	function toggleDropdown(): void {
		isOpen = !isOpen;
	}

	function handleLanguageChange(selectedLanguage: Locale): void {
		logger.debug('[TranslationStatus] Language change:', contentLanguage.value, '→', selectedLanguage);
		contentLanguage.set(selectedLanguage);
		isOpen = false;

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

	async function handleViewModeLanguageChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const selectedLanguage = target.value as Locale;

		contentLanguage.set(selectedLanguage);

		const currentCollectionId = collection.value?._id;
		const currentSearch = page.url.search;

		if (currentCollectionId) {
			const newPath = `/${selectedLanguage}/${currentCollectionId}${currentSearch}`;
			await goto(newPath, { replaceState: false, invalidateAll: true });
		} else {
			const currentPath = page.url.pathname;
			const pathParts = currentPath.split('/').filter(Boolean);
			if (pathParts.length > 0) {
				pathParts[0] = selectedLanguage;
				const newPath = '/' + pathParts.join('/') + currentSearch;
				await goto(newPath, { replaceState: false, invalidateAll: true });
			}
		}

		const customEvent = new CustomEvent('languageChanged', {
			detail: { language: selectedLanguage },
			bubbles: true
		});
		target.dispatchEvent(customEvent);
	}

	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (!target.closest('.translation-status-container')) {
			isOpen = false;
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

	$effect(() => {
		if (isOpen) {
			updateDropdownPosition();
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

{#if isViewMode}
	<select
		class="select w-full max-w-[70px] transition-all duration-200 hover:scale-105 focus:scale-105 focus:shadow-lg"
		value={currentLanguage}
		onchange={handleViewModeLanguageChange}
		disabled={availableLanguages.length === 0}
		aria-label="Select content language"
	>
		{#if availableLanguages.length === 0}
			<option disabled>Loading...</option>
		{:else}
			{#each availableLanguages as lang (lang)}
				<option value={lang}>{lang.toUpperCase()}</option>
			{/each}
		{/if}
	</select>
{:else}
	<div class="translation-status-container relative mt-1 inline-block text-left">
		<div>
			<button
				type="button"
				onclick={toggleDropdown}
				class="preset-outlined-surface-500 btn flex w-full items-center gap-1 p-1.5 transition-all duration-200 hover:scale-105"
				aria-haspopup="true"
				aria-expanded={isOpen}
				aria-controls="translation-menu"
				aria-label="Toggle language menu"
			>
				<span class="font-medium">{currentLanguage.toUpperCase()}</span>
				<iconify-icon
					icon="mdi:chevron-down"
					class="h-5 w-5 transition-transform duration-200"
					style="transform: rotate({isOpen ? 180 : 0}deg);"
					aria-hidden="true"
				></iconify-icon>
			</button>

			<div class="mt-0.5 transition-all duration-300">
				<Progress
					class="preset-outlined-secondary-500 transition-all duration-300 hover:shadow-sm"
					value={overallPercentage}
					aria-label={m.translationsstatus_overall_progress({ percentage: overallPercentage })}
				/>
				<div class="mt-1 text-center text-xs text-tertiary-500 dark:text-primary-500">
					{overallPercentage}% {m.translationsstatus_completed()}
				</div>
			</div>
		</div>
	</div>
{/if}

{#if isOpen && portalTarget}
	<div style="position: fixed; z-index: 99999; top: 0; left: 0; pointer-events: none; width: 100%; height: 100%;">
		<div
			id="translation-menu"
			class="origin-top-right divide-y divide-preset-200 rounded-lg border-2 border-surface-400 bg-white py-1 shadow-2xl backdrop-blur-sm focus:outline-none dark:divide-preset-600 dark:border-surface-500 dark:bg-surface-800 {showProgress
				? 'w-64'
				: 'w-48'}"
			style="position: fixed; top: {dropdownPosition.top}px; right: {dropdownPosition.right}px; pointer-events: auto;"
			role="menu"
			aria-orientation="vertical"
			aria-labelledby="language-menu-button"
			transition:scale={{ duration: 200, easing: quintOut, start: 0.95 }}
		>
			<div role="none" class="divide-y divide-preset-200 dark:divide-preset-400">
				{#each availableLanguages as lang, index (lang)}
					{@const percentage = languageProgress[lang] || 0}
					{@const isActive = currentLanguage === lang}

					<button
						role="menuitem"
						class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-all duration-200 hover:scale-[1.02] hover:bg-surface-300 active:scale-[0.98] dark:hover:bg-surface-600 {isActive
							? 'bg-primary-500/20 text-primary-700 dark:text-primary-300'
							: ''} {showProgress ? 'justify-between' : 'justify-center'}"
						onclick={() => handleLanguageChange(lang as Locale)}
						aria-label={m.translationsstatus_select_language({ language: lang.toUpperCase() })}
						in:fade={{ duration: 200, delay: index * 30 }}
					>
						<div class="flex w-full items-center justify-between gap-2">
							<span class="font-medium transition-colors duration-200">
								{lang.toUpperCase()}
								{#if isActive}
									<span class="ml-1 text-xs" aria-label="Current language">●</span>
								{/if}
							</span>

							{#if showProgress && translationProgress.value?.[lang as Locale]}
								<div class="ml-2 flex flex-1 items-center gap-2">
									<div class="flex-1">
										<Progress class="transition-all duration-300" value={percentage} aria-hidden="true" />
									</div>
									<span class="min-w-10 text-right text-sm font-semibold">
										{percentage}%
									</span>
								</div>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			{#if showProgress}
				<div class="px-4 py-2" role="none" in:fade={{ duration: 200, delay: 100 }}>
					<div class="mb-1 text-center text-xs font-medium text-tertiary-500 dark:text-primary-500">
						{m.translationsstatus_completed()}
					</div>
					<div class="flex items-center justify-between gap-3">
						{#if overallPercentage}
							<div class="flex-1">
								<Progress class="transition-all duration-300" value={overallPercentage} aria-hidden="true" />
							</div>
						{/if}
						<span class="min-w-10 text-right text-sm font-bold {getTextColor(overallPercentage)}">
							{overallPercentage}%
						</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
