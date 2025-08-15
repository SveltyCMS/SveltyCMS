<!--
@file src/routes/setup/language/+page.svelte
@description Language selection screen before the main setup process
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	// Paraglide imports
	import { setLocale, getLocale, locales as availableLocales } from '@src/paraglide/runtime';
	import * as m from '@src/paraglide/messages';

	// Language utilities
	import { getLanguageName } from '@utils/languageUtils';

	// Stores
	import { systemLanguage } from '@stores/store.svelte';

	// Types
	type AvailableLanguage = (typeof availableLocales)[number];

	// State
	let searchQuery = $state('');
	let selectedLanguage = $state<AvailableLanguage>(getLocale());

	// Available languages sorted by name
	const sortedLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	// Filtered languages based on search
	const filteredLanguages = $derived(
		sortedLanguages.filter(
			(lang: AvailableLanguage) =>
				getLanguageName(lang, selectedLanguage).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase()) ||
				lang.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Handle language selection
	function handleLanguageSelection(lang: AvailableLanguage) {
		selectedLanguage = lang;

		// Update Paraglide locale
		setLocale(lang, { reload: false });

		// Update system language store
		systemLanguage.set(lang);

		// Save to localStorage
		if (browser) {
			localStorage.setItem('systemLanguage', lang);
		}
	}

	// Continue to main setup
	function continueToSetup() {
		goto('/setup?from=language');
	}

	// Check if setup is already completed
	onMount(async () => {
		try {
			const response = await fetch('/api/setup/status');
			const { setupCompleted } = await response.json();

			if (setupCompleted) {
				goto('/login');
				return;
			}
		} catch (error) {
			console.error('Failed to check setup status:', error);
		}
	});
</script>

<svelte:head>
	<title>{m.setup_language_title()}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
	<div class="w-full max-w-md">
		<!-- Welcome Card -->
		<div class="rounded-xl border border-slate-100 bg-white p-8 shadow-lg">
			<!-- Logo/Icon -->
			<div class="mb-8 text-center">
				<div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3e00]/10">
					<svg class="h-8 w-8 text-[#ff3e00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
						></path>
					</svg>
				</div>
				<h1 class="text-2xl font-semibold text-slate-900">
					{m.setup_language_welcome()}
				</h1>
				<p class="mt-2 text-sm text-slate-600">
					{m.setup_language_subtitle()}
				</p>
			</div>

			<!-- Language Selection -->
			<div class="space-y-6">
				<div>
					<label for="language-search" class="mb-2 block text-sm font-medium text-slate-700">
						{m.setup_language_title()}
					</label>

					<!-- Search Box -->
					<div class="relative mb-4">
						<input
							id="language-search"
							bind:value={searchQuery}
							type="text"
							placeholder={m.setup_language_search_placeholder()}
							class="w-full rounded-md border border-slate-200 bg-white px-4 py-2 pl-9 text-slate-800 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 focus:border-[#ff3e00] focus:outline-none focus:ring-1 focus:ring-[#ff3e00]/20"
						/>
						<svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.2-5.2m2.2-5.8a7 7 0 11-14 0 7 7 0 0114 0z"></path>
						</svg>
					</div>

					<!-- Language List -->
					<div class="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
						{#each filteredLanguages as lang (lang)}
							<button
								class="flex w-full items-center justify-between px-4 py-2.5 text-left transition-all duration-200 hover:bg-slate-50 {selectedLanguage ===
								lang
									? 'bg-[#ff3e00]/5 text-[#ff3e00]'
									: 'text-slate-700'} border-b border-slate-100 last:border-b-0"
								onclick={() => handleLanguageSelection(lang)}
							>
								<div class="flex items-center space-x-2">
									<span class="font-medium">
										{getLanguageName(lang, selectedLanguage)}
									</span>
									<span class="text-xs text-slate-500">
										({lang.toUpperCase()})
									</span>
								</div>
								{#if selectedLanguage === lang}
									<svg class="h-5 w-5 text-[#ff3e00]" viewBox="0 0 20 20" fill="currentColor">
										<path
											fill-rule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clip-rule="evenodd"
										></path>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Description -->
				<p class="mt-4 text-sm text-slate-500">
					{m.setup_language_description()}
				</p>

				<!-- Continue Button -->
				<button
					onclick={continueToSetup}
					class="mt-2 w-full rounded-md bg-[#ff3e00] px-4 py-2.5 font-medium text-white transition-all duration-200 hover:bg-[#ff3e00]/90 focus:outline-none focus:ring-2 focus:ring-[#ff3e00]/20"
				>
					{m.setup_language_continue()}
				</button>
			</div>
		</div>

		<!-- Footer -->
		<div class="mt-5 text-center">
			<p class="text-xs text-slate-400">SveltyCMS Multi-Language Setup</p>
		</div>
	</div>
</div>

<style>
	/* Custom scrollbar for language list */
	.max-h-64::-webkit-scrollbar {
		width: 4px;
	}

	.max-h-64::-webkit-scrollbar-track {
		background: transparent;
	}

	.max-h-64::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 2px;
	}

	.max-h-64::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.2);
	}

	/* Hide scrollbar in Firefox */
	.max-h-64 {
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
	}
</style>
