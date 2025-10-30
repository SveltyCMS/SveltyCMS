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
	import { untrack } from 'svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

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
		const currentProgress = { ...translationProgress.value };
		let hasTranslatableFields = false;

		// Initialize total fields for each language
		for (const lang of availableLanguages) {
			if (!currentProgress[lang]) {
				currentProgress[lang] = {
					total: new Set<string>(),
					translated: new Set<string>()
				};
			}

			// Add all translatable fields to the total set
			for (const field of currentCollection.fields as { translated?: boolean; label: string }[]) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					currentProgress[lang].total.add(fieldName);
					hasTranslatableFields = true;
				}
			}
		}

		// Show translation progress if there are translatable fields
		currentProgress.show = hasTranslatableFields;
		translationProgress.value = currentProgress;
	}

	// Update translation progress from field values
	function updateTranslationProgressFromFields(
		currentCollection: { fields: unknown[]; name?: unknown },
		currentCollectionValue: Record<string, unknown>
	): void {
		const currentProgress = { ...translationProgress.value };
		let hasUpdates = false;

		for (const lang of availableLanguages) {
			if (!currentProgress[lang]) continue;

			for (const field of currentCollection.fields as { translated?: boolean; label: string }[]) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					const dbFieldName = getFieldName(field, false);

					// Check if the field has a value for this language
					const fieldValue = currentCollectionValue[dbFieldName] as Record<string, unknown> | undefined;
					const langValue = fieldValue?.[lang];

					const isTranslated = isFieldTranslated(langValue);
					const wasTranslated = currentProgress[lang].translated.has(fieldName);

					if (isTranslated && !wasTranslated) {
						currentProgress[lang].translated.add(fieldName);
						hasUpdates = true;
					} else if (!isTranslated && wasTranslated) {
						currentProgress[lang].translated.delete(fieldName);
						hasUpdates = true;
					}
				}
			}
		}

		if (hasUpdates) {
			translationProgress.value = currentProgress;
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
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right
			};
		}
	}

	// Event handlers
	function toggleDropdown(): void {
		isOpen = !isOpen;
	}

	function handleLanguageChange(selectedLanguage: Locale): void {
		contentLanguage.set(selectedLanguage);
		isOpen = false;

		// Navigate to the new URL with updated language
		const currentPath = $page.url.pathname;
		const pathParts = currentPath.split('/').filter(Boolean);

		// Replace the language part (first segment) with the new language
		if (pathParts.length > 0) {
			pathParts[0] = selectedLanguage;
			const newPath = '/' + pathParts.join('/');
			goto(newPath, { replaceState: false, keepFocus: true });
		}

		// Dispatch custom event
		if (typeof window !== 'undefined') {
			const customEvent = new CustomEvent('languageChanged', {
				detail: { language: selectedLanguage },
				bubbles: true
			});
			window.dispatchEvent(customEvent);
		}
	}

	// Handle language change for view mode select
	function handleViewModeLanguageChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const selectedLanguage = target.value as Locale;

		// Update the content language store
		contentLanguage.set(selectedLanguage);

		// Navigate to the new URL with updated language
		const currentPath = $page.url.pathname;
		const pathParts = currentPath.split('/').filter(Boolean);

		// Replace the language part (first segment) with the new language
		if (pathParts.length > 0) {
			pathParts[0] = selectedLanguage;
			const newPath = '/' + pathParts.join('/');
			goto(newPath, { replaceState: false, keepFocus: true });
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
	let lastCollectionId = $state<string | undefined>(undefined);
	$effect(() => {
		const currentCollection = collection.value;
		const collectionId = currentCollection?._id as string | undefined;

		if (currentCollection?.fields && collectionId && collectionId !== lastCollectionId) {
			untrack(() => {
				isInitialized = false;
				initializeTranslationProgress(currentCollection);
				calculateCompletionTotals();
				isInitialized = true;
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
				untrack(() => {
					updateTranslationProgressFromFields(currentCollection, currentCollectionValue);
					lastCollectionValueStr = currentStr;
				});
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
				<div class="mt-1 text-center text-xs text-surface-600 dark:text-surface-400">
					{overallPercentage}% {m.translationsstatus_completed()}
				</div>
			</div>
		</div>

		<!-- Dropdown menu with fixed positioning -->
		{#if isOpen}
			<div
				id="translation-menu"
				class="fixed z-[9999] mt-1 origin-top-right divide-y divide-surface-200 rounded border border-surface-300 bg-surface-100 py-1 shadow-xl focus:outline-none dark:divide-surface-400 dark:bg-surface-800 {showProgress
					? 'w-64'
					: 'w-48'}"
				style="top: {dropdownPosition.top}px; right: {dropdownPosition.right}px;"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="language-menu-button"
				transition:scale={{ duration: 200, easing: quintOut, start: 0.95, opacity: 0 }}
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
					<div class="px-4 py-3" role="none" in:fade={{ duration: 200, delay: 100 }}>
						<div class="mb-1 text-center text-xs font-medium text-surface-600 dark:text-surface-400">
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
		{/if}
	</div>
{/if}
