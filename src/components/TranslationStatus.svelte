<!-- 
 @file src/components/TranslationStatus.svelte 
 @description Translation status component. 
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';
	import { contentLanguage, translationStatusOpen, translationProgress } from '@stores/store';
	import { mode } from '@stores/collectionStore';

	import { ProgressBar } from '@skeletonlabs/skeleton';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { AvailableLanguageTag } from '@src/paraglide/runtime';

	// State declarations
	let isOpen = $state(false);
	let completionStatus = $state(0);

	// Handles the language change
	function handleChange(event: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
		const selectedLanguage = event.currentTarget.value.toLowerCase() as AvailableLanguageTag;
		contentLanguage.set(selectedLanguage);
		isOpen = false;
		translationStatusOpen.set(false);
	}

	// Handle language button click
	function handleLanguageClick(lang: AvailableLanguageTag) {
		contentLanguage.set(lang);
		isOpen = false;
		translationStatusOpen.set(false);
	}

	// Define a function to close any open elements
	function closeOpenStates() {
		translationStatusOpen.set(true);
	}

	// Function to toggle the dropdown
	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Function to determine the color based on the value
	function getColor(value: number) {
		if (value >= 80) {
			return 'bg-primary-500';
		} else if (value >= 40) {
			return 'bg-warning-500';
		} else {
			return 'bg-error-500';
		}
	}

	// Effect to update completion status when translation progress changes
	$effect(() => {
		if ($translationProgress.show) {
			let total = 0;
			let totalTranslated = 0;
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
				const progress = $translationProgress[lang];
				if (!progress || typeof progress === 'boolean') continue;
				totalTranslated += progress.translated.size;
				total += progress.total.size;
			}
			completionStatus = Math.round((totalTranslated / total) * 100);
		} else {
			completionStatus = 0;
		}
	});

	// Effect to update translation progress based on mode
	$effect(() => {
		if ($mode !== 'view') {
			translationProgress.set({ show: true });
		} else {
			translationProgress.set({ show: false });
		}
	});
</script>

{#if $mode === 'edit'}
	<!-- Language -->
	<div class="relative mt-1 inline-block text-left">
		<div>
			<button
				class="border-sm:btn variant-ghost-surface btn-sm flex w-16 items-center gap-3 !rounded-none !rounded-t border border-b-0 border-surface-400"
				id="options-menu"
				aria-haspopup="true"
				aria-expanded={isOpen}
				onclick={toggleDropdown}
			>
				{$contentLanguage.toUpperCase()}
				<iconify-icon icon="mingcute:down-line" width="20" class="text-surface-500"></iconify-icon>
			</button>

			<ProgressBar
				value={completionStatus}
				labelledby="Completion Status"
				min={0}
				max={100}
				rounded="none"
				height="h-1"
				meter={getColor(completionStatus)}
				track="bg-surface-500 dark:bg-surface-400 transition-all rounded-b"
			/>
		</div>

		<!-- dropdown -->
		{#if isOpen}
			<div class="absolute right-0 mt-2 max-h-56 w-44 overflow-y-auto rounded border border-surface-400 bg-white shadow-2xl dark:bg-surface-500">
				<div class="flex flex-col py-2" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
						<button
							onclick={() => handleLanguageClick(lang as AvailableLanguageTag)}
							class="mx-2 py-1 hover:bg-surface-50 hover:dark:text-black"
							role="menuitem"
						>
							<div class="flex items-center justify-between gap-1">
								<span class="font-bold">{lang.toUpperCase()}</span>
								<span class="text-xs">
									{#if $translationProgress[lang] && typeof $translationProgress[lang] !== 'boolean' && $translationProgress[lang].translated && $translationProgress[lang].total}
										{Math.round(($translationProgress[lang].translated.size / $translationProgress[lang].total.size) * 100)}%
									{:else}
										0%
									{/if}
								</span>
							</div>

							{#if $translationProgress[lang] && typeof $translationProgress[lang] !== 'boolean' && $translationProgress[lang].translated && $translationProgress[lang].total}
								<ProgressBar
									value={Math.round(($translationProgress[lang].translated.size / $translationProgress[lang].total.size) * 100)}
									labelledby={lang.toUpperCase()}
									min={0}
									max={100}
									rounded="none"
									height="h-1"
									meter={getColor(Math.round(($translationProgress[lang].translated.size / $translationProgress[lang].total.size) * 100))}
									track="bg-surface-300 dark:bg-surface-300 transition-all"
								/>
							{/if}
						</button>
					{/each}
					<div class="px-2 py-2 text-center text-sm text-black dark:text-primary-500" role="menuitem">
						{m.translationsstatus_completed()}{completionStatus}%

						<ProgressBar
							value={completionStatus}
							min={0}
							max={100}
							rounded="none"
							height="h-1"
							meter={getColor(completionStatus)}
							track="bg-surface-300 dark:bg-surface-300 transition-all"
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Language -->
	<select
		class="variant-ghost-surface rounded-t border-surface-500 dark:text-white"
		value={$contentLanguage}
		onchange={handleChange}
		onfocus={() => {
			closeOpenStates();
		}}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
			<option class="bg-surface-500 text-white" value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
{/if}
