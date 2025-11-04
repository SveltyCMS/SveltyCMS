<!--
@file src/components/TranslationStatus.svelte
@component
**Translation status component for displaying translation progress per language.**

@example
<TranslationStatus />

### Features
- Displays available content languages
- Shows translation progress per language
- Dropdown menu for selecting content language	
-->

<script lang="ts">
	import { untrack, onMount, onDestroy } from 'svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Skeleton
	import { ProgressBar } from '@skeletonlabs/skeleton';

	// Store
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
		// Create portal container at body level for dropdown
		if (typeof document !== 'undefined') {
			portalTarget = document.createElement('div');
			portalTarget.id = 'translation-dropdown-portal';
			portalTarget.style.position = 'fixed';
			portalTarget.style.zIndex = '99999';
			portalTarget.style.pointerEvents = 'none'; // Allow clicks to pass through container
			document.body.appendChild(portalTarget);
		}
	});

	onDestroy(() => {
		// Clean up portal container
		if (portalTarget && portalTarget.parentNode) {
			portalTarget.parentNode.removeChild(portalTarget);
		}
	});

	// Types
	interface CompletionTotals {
		total: number;
		translated: number;
	}

	// State
	let isOpen = $state(false);
	let isInitialized = $state(false);
	let completionTotals = $state<CompletionTotals>({ total: 0, translated: 0 });

	// Derived values
	let availableLanguages = $derived.by<Locale[]>(() => {
		// Wait for publicEnv to be initialized
		const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (!languages || !Array.isArray(languages)) {
			return ['en'] as Locale[];
		}
		return languages as Locale[];
	});

	let currentLanguage = $derived(contentLanguage.value);
	let currentMode = $derived(mode.value);
	let isViewMode = $derived(currentMode === 'view');

	let overallPercentage = $derived.by(() => {
		const { total, translated } = completionTotals;
		return total > 0 ? Math.round((translated / total) * 100) : 0;
	});

	let showProgress = $derived(translationProgress.value?.show || completionTotals.total > 0);

	// Calculate language-specific progress
	let languageProgress = $derived.by(() => {
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

	function isFieldTranslated(value: unknown): boolean {
		if (value === null || value === undefined) return false;
		if (typeof value === 'string') return value.trim() !== '';
		return Boolean(value);
	}

	// Initialize translation progress
	function initializeTranslationProgress(currentCollection: { fields: unknown[]; name?: unknown; _id?: string }): void {
		const newProgress: typeof translationProgress.value = { ...translationProgress.value };
		let hasTranslatableFields = false;

		for (const lang of availableLanguages) {
			const newTotalSet = new Set<string>(); // <-- 1. Create a fresh, empty Set for 'total'

			for (const field of currentCollection.fields as { translated?: boolean; label: string }[]) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					newTotalSet.add(fieldName); // <-- 2. Add fields to the new set
					hasTranslatableFields = true;
				}
			}

			// 3. Create a new language object with the new 'total' set
			//    and a new, empty 'translated' set.
			newProgress[lang] = {
				total: newTotalSet,
				translated: new Set<string>() // <-- 4. MUST create a new, empty 'translated' set
			};
		}

		newProgress.show = hasTranslatableFields;
		translationProgress.value = newProgress;
	}

	// Update translation progress from field values
	function updateTranslationProgressFromFields(
		currentCollection: { fields: unknown[]; name?: unknown },
		currentCollectionValue: Record<string, unknown>
	): void {
		const newProgress = { ...translationProgress.value }; // 1. Shallow copy the top-level store
		let hasUpdates = false;

		for (const lang of availableLanguages) {
			const originalLangProgress = newProgress[lang];
			if (!originalLangProgress) continue;

			// 2. Create a NEW Set for 'translated' based on the old one
			const newTranslatedSet = new Set(originalLangProgress.translated);
			let langHasUpdates = false;

			for (const field of currentCollection.fields as { translated?: boolean; label: string }[]) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					const dbFieldName = getFieldName(field, false);

					// Check if the field has a value for this language
					const fieldValue = currentCollectionValue[dbFieldName] as Record<string, unknown> | undefined;
					const langValue = fieldValue?.[lang];

					const isTranslated = isFieldTranslated(langValue);
					// 3. Check against the *original* set (important!)
					const wasTranslated = originalLangProgress.translated.has(fieldName);

					if (isTranslated && !wasTranslated) {
						newTranslatedSet.add(fieldName); // 4. Modify the NEW set
						langHasUpdates = true;
					} else if (!isTranslated && wasTranslated) {
						newTranslatedSet.delete(fieldName); // 4. Modify the NEW set
						langHasUpdates = true;
					}
				}
			}

			if (langHasUpdates) {
				// 5. Create a new lang object, replacing the 'translated' set
				newProgress[lang] = {
					...originalLangProgress, // carries over the 'total' set
					translated: newTranslatedSet // assigns the NEW 'translated' set
				};
				hasUpdates = true;
			}
		}

		if (hasUpdates) {
			translationProgress.value = newProgress; // 6. Assign the new top-level object to the store
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

	// Calculate dropdown position based on button location
	function updateDropdownPosition(): void {
		const button = document.querySelector('.translation-status-container button');
		if (button) {
			const rect = button.getBoundingClientRect();
			dropdownPosition = {
				top: rect.bottom + 8, // Increased from 4px to 8px for more spacing
				right: window.innerWidth - rect.right
			};
		}
	}

	// Event handlers
	function toggleDropdown(): void {
		isOpen = !isOpen;
	}

	// EDIT/CREATE MODE: Toggle language locally WITHOUT navigation
	// Data is already loaded (single entry), just switch which language fields to show
	function handleLanguageChange(selectedLanguage: Locale): void {
		console.log('[TranslationStatus] Language change:', contentLanguage.value, '→', selectedLanguage);
		contentLanguage.set(selectedLanguage);
		isOpen = false;

		// Update URL to reflect language (passive, no reload)
		// This allows bookmarking/sharing the correct language URL
		if (typeof window !== 'undefined') {
			const currentPath = window.location.pathname;
			const pathParts = currentPath.split('/').filter(Boolean);

			if (pathParts.length > 0) {
				// Replace first segment (language) with new language
				pathParts[0] = selectedLanguage;
				const newPath = '/' + pathParts.join('/') + window.location.search;

				// Use replaceState to update URL without navigation/reload
				window.history.replaceState({}, '', newPath);
				console.log('[TranslationStatus] Updated URL to:', newPath);
			}

			// Dispatch custom event for local reactivity
			const customEvent = new CustomEvent('languageChanged', {
				detail: { language: selectedLanguage },
				bubbles: true
			});
			window.dispatchEvent(customEvent);
			console.log('[TranslationStatus] Dispatched languageChanged event');
		}
	}

	// VIEW MODE: Navigate to new language (triggers SSR reload with fresh data)
	// Used when browsing list - need to fetch entries in the new language
	async function handleViewModeLanguageChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const selectedLanguage = target.value as Locale;

		// Update the content language store
		contentLanguage.set(selectedLanguage);

		// ENTERPRISE: Always use collection UUID for language changes
		const currentCollectionId = collection.value?._id;
		const currentSearch = page.url.search;

		if (currentCollectionId) {
			// Navigate using UUID
			const newPath = `/${selectedLanguage}/${currentCollectionId}${currentSearch}`;
			await goto(newPath, { replaceState: false, invalidateAll: true });
		} else {
			// Fallback: preserve path structure
			const currentPath = page.url.pathname;
			const pathParts = currentPath.split('/').filter(Boolean);
			if (pathParts.length > 0) {
				pathParts[0] = selectedLanguage;
				const newPath = '/' + pathParts.join('/') + currentSearch;
				await goto(newPath, { replaceState: false, invalidateAll: true });
			}
		}

		// Dispatch a custom event to notify parent components
		const customEvent = new CustomEvent('languageChanged', {
			detail: { language: selectedLanguage },
			bubbles: true
		});
		target.dispatchEvent(customEvent);
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (!target.closest('.translation-status-container')) {
			isOpen = false;
		}
	}

	// Effects
	// This tracks the ENTRY ID, not the collection ID
	let lastEntryId = $state<string | undefined>(undefined);
	let lastCollectionId = $state<string | undefined>(undefined);

	$effect(() => {
		const currentCollection = collection.value;

		// Get the current ENTRY's ID from the collectionValue store
		const currentEntry = collectionValue.value as { _id?: string } | undefined;
		const entryId = currentEntry?._id;
		const collectionId = currentCollection?._id;

		// This effect now runs if:
		// 1. Collection changed (switching collections)
		// 2. Entry ID changed (switching entries or entering create mode)
		const collectionChanged = collectionId !== lastCollectionId;
		const entryChanged = entryId !== lastEntryId;

		if (currentCollection?.fields && (collectionChanged || entryChanged)) {
			console.log('[TranslationStatus] Initializing translation progress', {
				collectionId,
				entryId,
				collectionChanged,
				entryChanged,
				mode: entryId ? 'edit' : 'create'
			});

			untrack(() => {
				isInitialized = false;

				// 1. Reset the progress stats (clears all 'translated' sets)
				initializeTranslationProgress(currentCollection);

				// 2. Check if we are in EDIT mode (we have an entryId and data)
				if (entryId && currentEntry && Object.keys(currentEntry).length > 0) {
					// We are in "edit" mode.
					// Immediately calculate the progress for the entry we just loaded.
					updateTranslationProgressFromFields(currentCollection, currentEntry);
				} else {
					// We are in "create" mode (no entryId).
					// Just calculate totals (which will be 0 / Total)
					calculateCompletionTotals();
				}

				// 3. Mark as initialized and store the new entry/collection ID
				isInitialized = true;
				lastEntryId = entryId;
				lastCollectionId = collectionId;
			});
		}
	});

	// Track last collection value to prevent unnecessary updates
	let lastCollectionValueStr = $state<string>('');
	$effect(() => {
		const currentCollection = collection.value;
		const currentCollectionValue = collectionValue.value as Record<string, unknown>;

		if (currentCollection?.fields && currentCollectionValue && Object.keys(currentCollectionValue).length > 0 && isInitialized) {
			// Only update if data actually changed
			const currentStr = JSON.stringify(currentCollectionValue);
			if (currentStr !== lastCollectionValueStr) {
				console.log('[TranslationStatus] Collection value changed, updating progress');
				// Update translation progress from the new data
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
	<!-- View mode: Simple language selector -->
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
	<!-- Edit mode: Language selector with translation progress -->
	<div class="translation-status-container relative mt-1 inline-block text-left">
		<div>
			<!-- Language button -->
			<button
				type="button"
				onclick={toggleDropdown}
				class="variant-outline-surface btn flex w-full items-center gap-1 p-1.5 transition-all duration-200 hover:scale-105"
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

			<!-- Overall progress bar -->
			<div class="mt-0.5 transition-all duration-300">
				<ProgressBar
					class="variant-outline-secondary transition-all duration-300 hover:shadow-sm"
					value={overallPercentage}
					meter={getProgressColor(overallPercentage)}
					aria-label={m.translationsstatus_overall_progress({ percentage: overallPercentage })}
				/>
				<div class="mt-1 text-center text-xs text-tertiary-500 dark:text-primary-500">
					{overallPercentage}% {m.translationsstatus_completed()}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Dropdown menu portal - rendered at body level -->
{#if isOpen && portalTarget}
	<div style="position: fixed; z-index: 99999; top: 1; left: 0; pointer-events: none; width: 100%; height: 100%;">
		<div
			id="translation-menu"
			class="origin-top-right divide-y divide-surface-200 rounded-lg border-2 border-surface-400 bg-white py-1 shadow-2xl backdrop-blur-sm focus:outline-none dark:divide-surface-600 dark:border-surface-500 dark:bg-surface-800 {showProgress
				? 'w-64'
				: 'w-48'}"
			style="position: fixed; top: {dropdownPosition.top}px; right: {dropdownPosition.right}px; pointer-events: auto;"
			role="menu"
			aria-orientation="vertical"
			aria-labelledby="language-menu-button"
			transition:scale={{ duration: 200, easing: quintOut, start: 0.95 }}
		>
			<!-- Language list -->
			<div role="none" class="divide-y divide-surface-200 dark:divide-surface-400">
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
							<!-- Language name -->
							<span class="font-medium transition-colors duration-200">
								{lang.toUpperCase()}
								{#if isActive}
									<span class="ml-1 text-xs" aria-label="Current language">●</span>
								{/if}
							</span>

							<!-- Progress indicator -->
							{#if showProgress && translationProgress.value?.[lang as Locale]}
								<div class="ml-2 flex flex-1 items-center gap-2">
									<div class="flex-1">
										<ProgressBar class="transition-all duration-300" value={percentage} meter={getProgressColor(percentage)} aria-hidden="true" />
									</div>
									<span class="min-w-[2.5rem] text-right text-sm font-semibold">
										{percentage}%
									</span>
								</div>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<!-- Overall completion summary -->
			{#if showProgress}
				<div class="px-4 py-2" role="none" in:fade={{ duration: 200, delay: 100 }}>
					<div class="mb-1 text-center text-xs font-medium text-tertiary-500 dark:text-primary-500">
						{m.translationsstatus_completed()}
					</div>
					<div class="flex items-center justify-between gap-3">
						{#if overallPercentage}
							<div class="flex-1">
								<ProgressBar
									class="transition-all duration-300"
									value={overallPercentage}
									meter={getProgressColor(overallPercentage)}
									aria-hidden="true"
								/>
							</div>
						{/if}
						<span class="min-w-[2.5rem] text-right text-sm font-bold {getTextColor(overallPercentage)}">
							{overallPercentage}%
						</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
