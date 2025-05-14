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
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { mode } from '@src/stores/collectionStore.svelte';
	import { ProgressBar } from '@skeletonlabs/skeleton';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { AvailableLanguageTag } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });

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
		} else {
			completionTotals = { total: 0, translated: 0 };
		}
	});

	// Derived completion status
	let completionStatus = $derived(completionTotals.total > 0 ? Math.round((completionTotals.translated / completionTotals.total) * 100) : 0);

	// Simplified language change handler
	function handleLanguageChange(selectedLanguage: AvailableLanguageTag) {
		contentLanguage.set(selectedLanguage);
		isOpen = false;
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
		if (!langProgress || langProgress.total.size === 0) return 0; // Avoid division by zero
		return Math.round((langProgress.translated.size / langProgress.total.size) * 100);
	}
</script>

{#if mode.value === 'view'}
	<!-- Language selection -->
	<select
		class="select w-full max-w-[70px]"
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
		<div>
			<button
				type="button"
				onclick={toggleDropdown}
				class="variant-outline-surface btn flex items-center p-1.5"
				aria-haspopup="true"
				aria-expanded={isOpen}
				aria-controls="translation-menu"
			>
				<span>{contentLanguage.value.toUpperCase()}</span>
				<iconify-icon
					icon="mdi:chevron-down"
					class="{isOpen ? 'rotate-180' : ''} ml-1 h-5 w-5 transition-transform duration-150 ease-in-out"
					aria-hidden="true"
				></iconify-icon>
			</button>
			<!-- Translation Progress -->
			<ProgressBar
				class="variant-outline-secondary mt-0.5"
				value={completionStatus}
				meter={getColor(completionStatus)}
				aria-label={m.translationsstatus_overall_progress({ percentage: completionStatus })}
			/>
		</div>

		<!-- Dropdown Language Status -->
		{#if isOpen}
			<div
				id="translation-menu"
				class="{translationProgress().show
					? 'w-64'
					: ''} absolute right-0 z-10 mt-1 origin-top-right divide-y divide-surface-200 rounded-md border border-surface-300 bg-surface-100 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:divide-surface-400 dark:bg-surface-800"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="options-menu"
			>
				<!-- Language Items -->
				<div role="none" class="divide-y divide-surface-200 dark:divide-surface-400">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang (lang)}
						<button
							role="menuitem"
							class="{translationProgress().show
								? 'justify-between'
								: 'justify-center'} flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-300 dark:hover:bg-surface-600"
							onclick={() => handleLanguageChange(lang as AvailableLanguageTag)}
							aria-label={m.translationsstatus_select_language({ language: lang.toUpperCase() })}
						>
							<div class="flex items-center justify-between gap-1">
								<!-- Language -->
								<span class="font-medium">{lang.toUpperCase()}</span>
								<!-- Progress -->
								{#if translationProgress()[lang as AvailableLanguageTag]}
									<ProgressBar
										class="mt-1"
										value={getLanguageProgress(lang as AvailableLanguageTag)}
										meter={getColor(getLanguageProgress(lang as AvailableLanguageTag))}
									/>
								{/if}
								<!-- Percentage -->
								<span class="text-sm">
									{getLanguageProgress(lang as AvailableLanguageTag)}%
								</span>
							</div>
						</button>
					{/each}
				</div>
				<!-- Overall Completion -->
				<div class="px-4 py-1" role="none">
					<div class="mb-1 text-center text-xs font-medium">{m.translationsstatus_completed()}</div>
					<div class="{completionStatus ? 'justify-between' : 'justify-center'} flex items-center gap-1">
						<!-- Percentage -->
						{#if completionStatus}
							<ProgressBar class="flex-grow" value={completionStatus} meter={getColor(completionStatus)} aria-hidden="true" />
						{/if}
						<span class="text-xs font-semibold">{completionStatus}%</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
