<!-- 
 @file src/components/TranslationStatus.svelte 
 @component
 **Translation status component for displaying translation progress per language in a progress bar with percentage.**

@example
 <TranslationStatus />  

 ### Props:
 - `mode` {object} - The current mode object from the mode store
 - `collection` {object} - The current collection object from the collection store

 ### Features:
 - Persists translation progress through API calls
 - Displays translation progress per language in a progress bar with percentage
 - Handles language selection and translation progress updates
 - Smooth animations and micro-interactions
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { ProgressBar } from '@skeletonlabs/skeleton';
	import { collection, collectionValue, mode } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress, updateTranslationProgress } from '@stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { cubicOut, quintOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });
	// ENHANCEMENT: Use a local state for available languages to make the component more robust.
	let availableLanguages = $derived.by<Locale[]>(() => {
		if (publicEnv && Array.isArray(publicEnv.AVAILABLE_CONTENT_LANGUAGES)) {
			return publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[];
		} else {
			console.error('[TranslationStatus] publicEnv.AVAILABLE_CONTENT_LANGUAGES is not a valid array. Please check your configuration.', publicEnv);
			return [];
		}
	});

	// Track initialization
	let isInitialized = $state(false);

	// Animation stores
	const dropdownOpacity = new Tween(0, {
		duration: 200,
		easing: cubicOut
	});

	const dropdownScale = new Tween(0.95, {
		duration: 200,
		easing: cubicOut
	});

	const progressValue = new Tween(0, {
		duration: 800,
		easing: quintOut
	});

	const chevronRotation = new Tween(0, {
		duration: 200,
		easing: cubicOut
	});

	// Store individual language progress values for smooth transitions
	let languageProgressValues = $derived.by<Record<string, any>>(() => {
		const progressValues: Record<string, any> = {};
		for (const lang of availableLanguages) {
			progressValues[lang] = new Tween(0, { duration: 200, easing: quintOut });
		}
		return progressValues;
	});
	// ENHANCEMENT: This effect safely loads the languages from the configuration.
	// It checks if the data is a valid array before updating the state,
	// preventing errors if the config is malformed or loads unexpectedly.

	// Initialize translation progress tracking when collection changes
	$effect(() => {
		const currentCollection = collection.value;
		if (currentCollection?.fields && currentCollection._id) {
			// Reset initialization state when collection changes
			isInitialized = false;
			initializeTranslationProgress(currentCollection);
			renderLanguageProgess();
			isInitialized = true;
		}
	});

	// Update translation progress when field values change
	$effect(() => {
		const currentCollection = collection.value;
		const currentCollectionValue = collectionValue.value;

		if (currentCollection?.fields && currentCollectionValue && Object.keys(currentCollectionValue).length > 0 && isInitialized) {
			updateTranslationProgressFromFields(currentCollection, currentCollectionValue);
		}
	});

	// Initialize translation progress with all translatable fields
	function initializeTranslationProgress(currentCollection: any) {
		console.log('[TranslationStatus] Initializing translation progress for collection:', currentCollection.name);
		const currentProgress = translationProgress();
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
			for (const field of currentCollection.fields) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					currentProgress[lang].total.add(fieldName);
					hasTranslatableFields = true;
					console.log(`[TranslationStatus] Added translatable field: ${fieldName} for language: ${lang}`);
				}
			}
		}

		// Show translation progress if there are translatable fields
		currentProgress.show = hasTranslatableFields;
		console.log('[TranslationStatus] Translation progress show:', currentProgress.show, 'hasTranslatableFields:', hasTranslatableFields);
		updateTranslationProgress(currentProgress);
	}

	// Update translation progress based on current field values
	function updateTranslationProgressFromFields(currentCollection: any, currentCollectionValue: Record<string, any>) {
		const currentProgress = translationProgress();
		let hasUpdates = false;
		for (const lang of availableLanguages) {
			if (!currentProgress[lang]) continue;

			for (const field of currentCollection.fields) {
				if (field.translated) {
					const fieldName = `${currentCollection.name}.${getFieldName(field)}`;
					const dbFieldName = getFieldName(field, false);

					// Check if the field has a value for this language
					const fieldValue = currentCollectionValue[dbFieldName];
					const langValue = fieldValue?.[lang];

					// Consider field translated if it has a non-empty value
					const isTranslated =
						langValue !== null && langValue !== undefined && (typeof langValue === 'string' ? langValue.trim() !== '' : Boolean(langValue));

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
			updateTranslationProgress(currentProgress);
			renderLanguageProgess();
		}
	}

	function renderLanguageProgess() {
		const progress = translationProgress();
		let total = 0;
		let translated = 0;
		for (const lang of availableLanguages) {
			const langProgress = progress[lang as Locale];
			if (!langProgress) continue;
			translated += langProgress.translated.size;
			total += langProgress.total.size;
		}
		completionTotals = { total, translated };

		// Update overall progress animation
		const newPercentage = total > 0 ? Math.round((translated / total) * 100) : 0;
		progressValue.target = newPercentage;

		// Initialize and update individual language progress
		// initializeLanguageProgress();
		for (const lang of availableLanguages) {
			const langProgress = progress[lang as Locale];
			const percentage = langProgress && langProgress.total.size > 0 ? Math.round((langProgress.translated.size / langProgress.total.size) * 100) : 0;

			console.log('[TranslationStatus] lang:', lang, 'percentage:', percentage);
			languageProgressValues[lang].target = percentage;
		}
	}
	// Animate dropdown visibility
	$effect(() => {
		if (isOpen) {
			dropdownOpacity.target = 1;
			dropdownScale.target = 1;
			chevronRotation.target = 180;
		} else {
			dropdownOpacity.target = 0;
			dropdownScale.target = 0.95;
			chevronRotation.target = 0;
		}
	});

	// Derived completion status
	let completionStatus = $derived(completionTotals.total > 0 ? Math.round((completionTotals.translated / completionTotals.total) * 100) : 0);

	// Simplified language change handler with animation feedback
	function handleLanguageChange(selectedLanguage: Locale) {
		console.log('[TranslationStatus] Language change:', selectedLanguage);
		contentLanguage.set(selectedLanguage);
		isOpen = false;

		// Add subtle feedback animation
		chevronRotation.target = -10;
		setTimeout(() => (chevronRotation.target = 0), 100);

		// Dispatch a custom event to notify parent components
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
		console.log('[TranslationStatus] View mode language change:', selectedLanguage);

		// Update the content language store
		contentLanguage.set(selectedLanguage);

		// Dispatch a custom event to notify parent components
		const customEvent = new CustomEvent('languageChanged', {
			detail: { language: selectedLanguage },
			bubbles: true
		});
		target.dispatchEvent(customEvent);
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function getColor(value: number): string {
		if (value >= 80) return 'bg-primary-500';
		if (value >= 40) return 'bg-warning-500';
		return 'bg-error-500';
	}

	// Get animated progress value for a language
	function getAnimatedLanguageProgress(lang: string): number {
		return languageProgressValues[lang] ? languageProgressValues[lang].current : 0;
	}

	// Derived value to track current language for debugging
	const currentLanguage = $derived(contentLanguage.value);

	// Debug effect to track language changes
	$effect(() => {
		console.log('[TranslationStatus] Current language updated to:', currentLanguage);
	});
</script>

{#if mode.value === 'view'}
	<!-- Language selection -->
	<select
		class="select w-full max-w-[70px] transition-all duration-200 hover:scale-105 focus:scale-105 focus:shadow-lg"
		value={currentLanguage}
		onchange={handleViewModeLanguageChange}
		disabled={availableLanguages.length === 0}
	>
		{#if availableLanguages.length === 0}
			<option disabled>...</option>
		{/if}
		<!-- FIX: Use the robust 'availableLanguages' state variable for iteration. -->
		{#each availableLanguages as lang (lang)}
			<option value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
{:else}
	<!-- Edit mode with translation progress -->
	<div class="relative mt-1 inline-block text-left">
		<!-- Button and Overall Progress -->
		<div class="transition-all duration-200 hover:scale-[1.02]">
			<button
				type="button"
				onclick={toggleDropdown}
				class="variant-outline-surface btn flex items-center p-1.5 transition-all duration-200 hover:shadow-md active:scale-95"
				aria-haspopup="true"
				aria-expanded={isOpen}
				aria-controls="translation-menu"
			>
				<span class="transition-colors duration-200">{currentLanguage.toUpperCase()}</span>
				<iconify-icon
					icon="mdi:chevron-down"
					class="ml-1 h-5 w-5 transition-transform duration-200 ease-out"
					style="transform: rotate({chevronRotation.current}deg);"
					aria-hidden="true"
				></iconify-icon>
			</button>

			<!-- Translation Progress with smooth animation - Always show in edit mode -->
			<div class="mt-0.5 transition-all duration-300">
				<ProgressBar
					class="variant-outline-secondary transition-all duration-300 hover:shadow-sm"
					value={progressValue.current}
					meter={getColor(progressValue.current)}
					aria-label={m.translationsstatus_overall_progress({ percentage: Math.round(progressValue.current) })}
				/>
				<div class="mt-1 text-center text-xs text-surface-600 dark:text-surface-400">
					{Math.round(progressValue.current)}% {m.translationsstatus_completed()}
				</div>
			</div>
		</div>

		<!-- Dropdown Language Status -->
		{#if isOpen}
			<div
				id="translation-menu"
				class="{translationProgress().show || completionTotals.total > 0
					? 'w-64'
					: 'w-48'} absolute -right-24 z-10 mt-1 origin-top-right divide-y divide-surface-200 rounded-md border border-surface-300 bg-surface-100 py-1 shadow-xl ring-1 ring-black ring-opacity-5 backdrop-blur-sm focus:outline-none dark:divide-surface-400 dark:bg-surface-800 md:right-0"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="options-menu"
				style="opacity: {dropdownOpacity.current}; transform: scale({dropdownScale.current}); transform-origin: top right;"
			>
				<!-- Language Items -->
				<div role="none" class="divide-y divide-surface-200 dark:divide-surface-400">
					<!-- FIX: Use the robust 'availableLanguages' state variable for iteration. -->
					{#each availableLanguages as lang, index (lang)}
						<button
							role="menuitem"
							class="{translationProgress().show || completionTotals.total > 0
								? 'justify-between'
								: 'justify-center'} active:scale-98 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-all duration-200 hover:scale-[1.02] hover:bg-surface-300 dark:hover:bg-surface-600 {currentLanguage ===
							lang
								? 'bg-primary-500/20 text-primary-700 dark:text-primary-300'
								: ''}"
							onclick={() => handleLanguageChange(lang as Locale)}
							aria-label={m.translationsstatus_select_language({ language: lang.toUpperCase() })}
							style="animation-delay: {index * 50}ms;"
						>
							<div class="flex w-full items-center justify-between gap-1">
								<!-- Language -->
								<span class="font-medium transition-colors duration-200 hover:text-primary-500">
									{lang.toUpperCase()}
									{#if currentLanguage === lang}
										<span class="ml-1 text-xs">●</span>
									{/if}
								</span>

								<!-- Progress Bar and Percentage -->
								{#if (translationProgress().show || completionTotals.total > 0) && translationProgress()[lang as Locale]}
									<div class="ml-2 flex flex-1 items-center gap-2">
										<div class="flex-1">
											<ProgressBar
												class="transition-all duration-300"
												value={getAnimatedLanguageProgress(lang) ?? 0}
												meter={getColor(getAnimatedLanguageProgress(lang) ?? 0)}
											/>
										</div>
										<span class="min-w-[2.5rem] text-right text-sm font-semibold transition-all duration-300">
											{Math.round(getAnimatedLanguageProgress(lang) ?? 0)}%
										</span>
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>

				<!-- Overall Completion -->
				{#if translationProgress().show || completionTotals.total > 0}
					<div class="dark:bg-surface-750 bg-surface-50 px-4 py-3" role="none">
						<div class="mb-2 text-center text-xs font-medium text-surface-600 dark:text-surface-400">
							{m.translationsstatus_completed()}
						</div>
						<div class="{completionStatus ? 'justify-between' : 'justify-center'} flex items-center gap-3">
							{#if completionStatus}
								<div class="flex-1">
									<ProgressBar
										class="transition-all duration-300"
										value={progressValue.current}
										meter={getColor(progressValue.current)}
										aria-hidden="true"
									/>
								</div>
							{/if}
							<span
								class="min-w-[2.5rem] text-right text-sm font-bold transition-all duration-300 {getColor(progressValue.current).replace(
									'bg-',
									'text-'
								)}"
							>
								{Math.round(progressValue.current)}%
							</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
