<!-- 
 @file src/components/collectionDisplay/TranslationStatus.svelte 
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
	import { collection, mode } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress, setTranslationStatusOpen } from '@stores/store.svelte';
	import { cubicOut, quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let availableLanguages = $derived.by<Locale[]>(() => {
		return (publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) || [];
	});

	// Animation stores
	const dropdownOpacity = tweened(0, { easing: cubicOut });
	const dropdownScale = tweened(0.95, { easing: cubicOut });
	const chevronRotation = tweened(0, { easing: cubicOut });

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

	// Derived completion status
	let completionStatus = $derived(() => {
		const progress = translationProgress()[contentLanguage.value];
		if (!progress || progress.total.size === 0) return 0;
		return Math.round((progress.translated.size / progress.total.size) * 100);
	});

	// Simplified language change handler with animation feedback
	function handleLanguageChange(selectedLanguage: Locale) {
		contentLanguage.set(selectedLanguage);
		isOpen = false;
	}
</script>

{#if mode.value !== 'view'}
	<div class="relative">
		<button
			class="flex w-full items-center justify-between rounded-lg bg-gray-100 px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring focus-visible:ring-purple-500 focus-visible:ring-opacity-75"
			onclick={() => (isOpen = !isOpen)}
			aria-haspopup="true"
			aria-expanded={isOpen}
		>
			<span>{contentLanguage.value.toUpperCase()}: {completionStatus}%</span>
			<iconify-icon icon="mdi:chevron-down" style="transform: rotate({$chevronRotation}deg);"></iconify-icon>
		</button>
		{#if isOpen}
			<div
				class="absolute z-10 mt-2 w-full origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
				style="opacity: {$dropdownOpacity}; transform: scale({$dropdownScale});"
			>
				<div class="px-1 py-1">
					{#each availableLanguages as lang}
						<button
							type="button"
							class="block w-full px-4 py-2 text-left text-sm {contentLanguage.value === lang
								? 'font-bold text-primary-500'
								: 'text-gray-900'} hover:bg-gray-100"
							onclick={() => handleLanguageChange(lang)}
						>
							{lang.toUpperCase()}
							<ProgressBar
								label="Translated"
								value={translationProgress()[lang]?.translated.size || 0}
								max={translationProgress()[lang]?.total.size || 1}
								meter="bg-primary-500"
								track="bg-primary-200"
							/>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
