<!--
@file src\plugins\cookie-consent\cookie-consent.svelte
@component
**Cookie Consent Banner**
Displays a GDPR-compliant cookie consent banner.
-->
<script lang="ts">
	import Toggles from '@src/components/system/inputs/toggles.svelte';
	import {
		cookie_analytics_desc,
		cookie_analytics_title,
		cookie_button_accept,
		cookie_button_customize,
		cookie_button_reject,
		cookie_button_save,
		cookie_description,
		cookie_heading,
		cookie_marketing_desc,
		cookie_marketing_title,
		cookie_necessary_desc,
		cookie_necessary_title
	} from '@src/paraglide/messages';
	import { consentStore } from '@src/stores/consent-store.svelte';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	let showBanner = $state(false);
	let showDetails = $state(false);

	// Local state for the details view before saving
	let preferences = $state({
		analytics: consentStore.analytics,
		marketing: consentStore.marketing
	});

	onMount(() => {
		// Show banner if user hasn't responded yet
		if (!consentStore.responded) {
			// Small delay for animation
			setTimeout(() => {
				showBanner = true;
			}, 500);
		}
	});

	function handleAcceptAll() {
		consentStore.acceptAll();
		showBanner = false;
	}

	function handleRejectAll() {
		consentStore.rejectAll();
		showBanner = false;
	}

	function handleSavePreferences() {
		consentStore.update(preferences);
		showBanner = false;
	}
</script>

{#if showBanner && !consentStore.responded}
	<div
		transition:fade={{ duration: 300 }}
		class="fixed bottom-0 left-0 right-0 z-9999 bg-white p-4 shadow-2xl dark:bg-surface-800 md:bottom-4 md:left-4 md:right-auto md:max-w-lg md:rounded-lg border-t md:border border-surface-200 dark:border-surface-700"
		role="dialog"
		aria-labelledby="cookie-heading"
	>
		<div class="flex flex-col gap-4">
			<!-- Header -->
			<div class="flex items-start gap-4">
				<div class="text-3xl">🍪</div>
				<div>
					<h2 id="cookie-heading" class="text-lg font-bold text-gray-900 dark:text-white">{cookie_heading()}</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{cookie_description()}</p>
				</div>
			</div>

			{#if showDetails}
				<div transition:slide class="border-t border-surface-200 py-4 dark:border-surface-700 space-y-3">
					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">{cookie_necessary_title()}</div>
							<div class="text-xs text-gray-500">{cookie_necessary_desc()}</div>
						</div>
						<Toggles value={true} disabled={true} />
					</div>

					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">{cookie_analytics_title()}</div>
							<div class="text-xs text-gray-500">{cookie_analytics_desc()}</div>
						</div>
						<Toggles bind:value={preferences.analytics} />
					</div>

					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">{cookie_marketing_title()}</div>
							<div class="text-xs text-gray-500">{cookie_marketing_desc()}</div>
						</div>
						<Toggles bind:value={preferences.marketing} />
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
				{#if showDetails}
					<button onclick={handleSavePreferences} class="btn preset-filled-primary flex-1">{cookie_button_save()}</button>
				{:else}
					<button onclick={() => (showDetails = true)} class="btn preset-tonal-secondary flex-1">{cookie_button_customize()}</button>
					<button onclick={handleRejectAll} class="btn preset-tonal-secondary flex-1">{cookie_button_reject()}</button>
					<button onclick={handleAcceptAll} class="btn preset-outlined-primary-500 flex-1">{cookie_button_accept()}</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
