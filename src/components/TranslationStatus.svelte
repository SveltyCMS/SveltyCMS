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
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { mode } from '@src/stores/collectionStore.svelte';
	import { ProgressBar } from '@skeletonlabs/skeleton';
	import { Tween } from 'svelte/motion';
	import { cubicOut, quintOut } from 'svelte/easing';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });

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
	const languageProgressValues = $state<Record<string, any>>({});

	// Initialize progress tweens for each language
	function initializeLanguageProgress() {
		const availableLanguages = publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[];
		for (const lang of availableLanguages) {
			if (!languageProgressValues[lang]) {
				languageProgressValues[lang] = new Tween(0, {
					duration: 600,
					easing: quintOut
				});
			}
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

	// Calculate completion totals when translation progress changes
	$effect(() => {
		const progress = translationProgress();
		if (progress.show) {
			let total = 0;
			let translated = 0;
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) {
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
			initializeLanguageProgress();
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) {
				const langProgress = progress[lang as Locale];
				const percentage =
					langProgress && langProgress.total.size > 0 ? Math.round((langProgress.translated.size / langProgress.total.size) * 100) : 0;
				if (languageProgressValues[lang]) {
					languageProgressValues[lang].target = percentage;
				}
			}
		} else {
			completionTotals = { total: 0, translated: 0 };
			progressValue.target = 0;
		}
	});

	// Derived completion status
	let completionStatus = $derived(completionTotals.total > 0 ? Math.round((completionTotals.translated / completionTotals.total) * 100) : 0);

	// Simplified language change handler with animation feedback
	function handleLanguageChange(selectedLanguage: Locale) {
		contentLanguage.set(selectedLanguage);
		isOpen = false;

		// Add subtle feedback animation
		chevronRotation.target = -10;
		setTimeout(() => (chevronRotation.target = 0), 100);
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function getColor(value: number): string {
		if (value >= 80) return 'bg-primary-500';
		if (value >= 40) return 'bg-warning-500';
		return 'bg-error-500';
	}

	// function getLanguageProgress(lang: Locale): number {
	// 	const progress = translationProgress();
	// 	const langProgress = progress[lang];
	// 	if (!langProgress || langProgress.total.size === 0) return 0;
	// 	return Math.round((langProgress.translated.size / langProgress.total.size) * 100);
	// }

	// Get animated progress value for a language
	function getAnimatedLanguageProgress(lang: string): number {
		return languageProgressValues[lang] ? languageProgressValues[lang].current : 0;
	}
</script>

{#if mode.value === 'view'}
	<!-- Language selection -->
	<select
		class="select w-full max-w-[70px] transition-all duration-200 hover:scale-105 focus:scale-105 focus:shadow-lg"
		value={contentLanguage.value}
		onchange={(e) => handleLanguageChange(e.currentTarget.value as Locale)}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[] as lang (lang)}
			<option value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
{:else}
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
				<span class="transition-colors duration-200">{contentLanguage.value.toUpperCase()}</span>
				<iconify-icon
					icon="mdi:chevron-down"
					class="ml-1 h-5 w-5 transition-transform duration-200 ease-out"
					style="transform: rotate({chevronRotation.current}deg);"
					aria-hidden="true"
				></iconify-icon>
			</button>

			<!-- Translation Progress with smooth animation -->
			<div class="mt-0.5 transition-all duration-300">
				<ProgressBar
					class="variant-outline-secondary transition-all duration-300 hover:shadow-sm"
					value={progressValue.current}
					meter={getColor(progressValue.current)}
					aria-label={m.translationsstatus_overall_progress({ percentage: Math.round(progressValue.current) })}
				/>
			</div>
		</div>

		<!-- Dropdown Language Status -->
		{#if isOpen}
			<div
				id="translation-menu"
				class="{translationProgress().show
					? 'w-64'
					: ''} absolute right-0 z-10 mt-1 origin-top-right divide-y divide-surface-200 rounded-md border border-surface-300 bg-surface-100 py-1 shadow-xl ring-1 ring-black ring-opacity-5 backdrop-blur-sm focus:outline-none dark:divide-surface-400 dark:bg-surface-800"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="options-menu"
				style="opacity: {dropdownOpacity.current}; transform: scale({dropdownScale.current}); transform-origin: top right;"
			>
				<!-- Language Items -->
				<div role="none" class="divide-y divide-surface-200 dark:divide-surface-400">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[] as lang, index (lang)}
						<button
							role="menuitem"
							class="{translationProgress().show
								? 'justify-between'
								: 'justify-center'} active:scale-98 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-all duration-200 hover:scale-[1.02] hover:bg-surface-300 dark:hover:bg-surface-600"
							onclick={() => handleLanguageChange(lang as Locale)}
							aria-label={m.translationsstatus_select_language({ language: lang.toUpperCase() })}
							style="animation-delay: {index * 50}ms;"
						>
							<div class="flex w-full items-center justify-between gap-1">
								<!-- Language -->
								<span class="font-medium transition-colors duration-200 hover:text-primary-500">
									{lang.toUpperCase()}
								</span>

								<!-- Progress Bar and Percentage -->
								{#if translationProgress()[lang as Locale]}
									<div class="ml-2 flex flex-1 items-center gap-2">
										<div class="flex-1">
											<ProgressBar
												class="transition-all duration-300"
												value={getAnimatedLanguageProgress(lang)}
												meter={getColor(getAnimatedLanguageProgress(lang))}
											/>
										</div>
										<span class="min-w-[2.5rem] text-right text-sm font-semibold transition-all duration-300">
											{Math.round(getAnimatedLanguageProgress(lang))}%
										</span>
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>

				<!-- Overall Completion -->
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
			</div>
		{/if}
	</div>
{/if}
