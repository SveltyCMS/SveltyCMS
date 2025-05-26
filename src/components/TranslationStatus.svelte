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
	import { tweened } from 'svelte/motion';
	import { cubicOut, quintOut } from 'svelte/easing';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { AvailableLanguageTag } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });

	// Animation stores
	const dropdownOpacity = tweened(0, {
		duration: 200,
		easing: cubicOut
	});

	const dropdownScale = tweened(0.95, {
		duration: 200,
		easing: cubicOut
	});

	const progressValue = tweened(0, {
		duration: 800,
		easing: quintOut
	});

	const chevronRotation = tweened(0, {
		duration: 200,
		easing: cubicOut
	});

	// Store individual language progress values for smooth transitions
	const languageProgressValues = $state<Record<string, any>>({});

	// Initialize progress tweens for each language
	function initializeLanguageProgress() {
		for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
			if (!languageProgressValues[lang]) {
				languageProgressValues[lang] = tweened(0, {
					duration: 600,
					easing: quintOut
				});
			}
		}
	}

	// Animate dropdown visibility
	$effect(() => {
		if (isOpen) {
			dropdownOpacity.set(1);
			dropdownScale.set(1);
			chevronRotation.set(180);
		} else {
			dropdownOpacity.set(0);
			dropdownScale.set(0.95);
			chevronRotation.set(0);
		}
	});

	// Calculate completion totals when translation progress changes
	$effect(() => {
		const progress = translationProgress();
		if (progress.show) {
			let total = 0;
			let translated = 0;
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
				const langProgress = progress[lang as AvailableLanguageTag];
				if (!langProgress) continue;
				translated += langProgress.translated.size;
				total += langProgress.total.size;
			}
			completionTotals = { total, translated };
			
			// Update overall progress animation
			const newPercentage = total > 0 ? Math.round((translated / total) * 100) : 0;
			progressValue.set(newPercentage);

			// Initialize and update individual language progress
			initializeLanguageProgress();
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
				const langProgress = progress[lang as AvailableLanguageTag];
				const percentage = langProgress && langProgress.total.size > 0 
					? Math.round((langProgress.translated.size / langProgress.total.size) * 100) 
					: 0;
				languageProgressValues[lang]?.set(percentage);
			}
		} else {
			completionTotals = { total: 0, translated: 0 };
			progressValue.set(0);
		}
	});

	// Derived completion status
	let completionStatus = $derived(completionTotals.total > 0 ? Math.round((completionTotals.translated / completionTotals.total) * 100) : 0);

	// Simplified language change handler with animation feedback
	function handleLanguageChange(selectedLanguage: AvailableLanguageTag) {
		contentLanguage.set(selectedLanguage);
		isOpen = false;
		
		// Add subtle feedback animation
		chevronRotation.set(-10);
		setTimeout(() => chevronRotation.set(0), 100);
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function getColor(value: number): string {
		if (value >= 80) return 'bg-primary-500';
		if (value >= 40) return 'bg-warning-500';
		return 'bg-error-500';
	}

	function getLanguageProgress(lang: AvailableLanguageTag): number {
		const progress = translationProgress();
		const langProgress = progress[lang];
		if (!langProgress || langProgress.total.size === 0) return 0;
		return Math.round((langProgress.translated.size / langProgress.total.size) * 100);
	}

	// Get animated progress value for a language
	function getAnimatedLanguageProgress(lang: string): number {
		return languageProgressValues[lang] ? languageProgressValues[lang].get() : 0;
	}
</script>

{#if mode.value === 'view'}
	<!-- Language selection -->
	<select
		class="select w-full max-w-[70px] transition-all duration-200 hover:scale-105 focus:scale-105 focus:shadow-lg"
		value={contentLanguage.value}
		onchange={(e) => handleLanguageChange(e.currentTarget.value as AvailableLanguageTag)}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang (lang)}
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
					style="transform: rotate({$chevronRotation}deg);"
					aria-hidden="true"
				></iconify-icon>
			</button>
			
			<!-- Translation Progress with smooth animation -->
			<div class="mt-0.5 transition-all duration-300">
				<ProgressBar
					class="variant-outline-secondary transition-all duration-300 hover:shadow-sm"
					value={$progressValue}
					meter={getColor($progressValue)}
					aria-label={m.translationsstatus_overall_progress({ percentage: Math.round($progressValue) })}
				/>
			</div>
		</div>

		<!-- Dropdown Language Status -->
		{#if isOpen}
			<div
				id="translation-menu"
				class="{translationProgress().show ? 'w-64' : ''} absolute right-0 z-10 mt-1 origin-top-right divide-y divide-surface-200 rounded-md border border-surface-300 bg-surface-100 py-1 shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none dark:divide-surface-400 dark:bg-surface-800 backdrop-blur-sm"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="options-menu"
				style="opacity: {$dropdownOpacity}; transform: scale({$dropdownScale}); transform-origin: top right;"
			>
				<!-- Language Items -->
				<div role="none" class="divide-y divide-surface-200 dark:divide-surface-400">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang, index (lang)}
						<button
							role="menuitem"
							class="{translationProgress().show ? 'justify-between' : 'justify-center'} flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-all duration-200 hover:bg-surface-300 dark:hover:bg-surface-600 hover:scale-[1.02] active:scale-98"
							onclick={() => handleLanguageChange(lang as AvailableLanguageTag)}
							aria-label={m.translationsstatus_select_language({ language: lang.toUpperCase() })}
							style="animation-delay: {index * 50}ms;"
						>
							<div class="flex items-center justify-between gap-1 w-full">
								<!-- Language -->
								<span class="font-medium transition-colors duration-200 hover:text-primary-500">
									{lang.toUpperCase()}
								</span>
								
								<!-- Progress Bar and Percentage -->
								{#if translationProgress()[lang as AvailableLanguageTag]}
									<div class="flex items-center gap-2 flex-1 ml-2">
										<div class="flex-1">
											<ProgressBar
												class="transition-all duration-300"
												value={getAnimatedLanguageProgress(lang)}
												meter={getColor(getAnimatedLanguageProgress(lang))}
											/>
										</div>
										<span class="text-sm font-semibold min-w-[2.5rem] text-right transition-all duration-300">
											{Math.round(getAnimatedLanguageProgress(lang))}%
										</span>
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
				
				<!-- Overall Completion -->
				<div class="px-4 py-3 bg-surface-50 dark:bg-surface-750" role="none">
					<div class="mb-2 text-center text-xs font-medium text-surface-600 dark:text-surface-400">
						{m.translationsstatus_completed()}
					</div>
					<div class="{completionStatus ? 'justify-between' : 'justify-center'} flex items-center gap-3">
						{#if completionStatus}
							<div class="flex-1">
								<ProgressBar 
									class="transition-all duration-300" 
									value={$progressValue} 
									meter={getColor($progressValue)} 
									aria-hidden="true" 
								/>
							</div>
						{/if}
						<span class="text-sm font-bold min-w-[2.5rem] text-right transition-all duration-300 {getColor($progressValue).replace('bg-', 'text-')}">
							{Math.round($progressValue)}%
						</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}