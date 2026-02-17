<!--
@file src/plugins/cookie-consent/CookieConsent.svelte
@component
**Cookie Consent Banner**
Displays a GDPR-compliant cookie consent banner.
-->
<script lang="ts">
	import Toggles from '@components/system/inputs/Toggles.svelte';
	import { consentStore } from '@src/stores/consentStore.svelte';
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
					<h2 id="cookie-heading" class="text-lg font-bold text-gray-900 dark:text-white">We value your privacy</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
						We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking "Accept All",
						you consent to our use of cookies.
					</p>
				</div>
			</div>

			{#if showDetails}
				<div transition:slide class="border-t border-surface-200 py-4 dark:border-surface-700 space-y-3">
					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">Necessary</div>
							<div class="text-xs text-gray-500">Required for the site to function</div>
						</div>
						<Toggles value={true} disabled={true} />
					</div>

					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">Analytics</div>
							<div class="text-xs text-gray-500">Helps us understand how you use the site</div>
						</div>
						<Toggles bind:value={preferences.analytics} />
					</div>

					<div class="flex items-center justify-between">
						<div>
							<div class="font-semibold text-sm">Marketing</div>
							<div class="text-xs text-gray-500">Used for personalized advertisements</div>
						</div>
						<Toggles bind:value={preferences.marketing} />
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
				{#if showDetails}
					<button onclick={handleSavePreferences} class="btn variant-filled-primary flex-1">Save Preferences</button>
				{:else}
					<button onclick={() => (showDetails = true)} class="btn variant-ghost-surface flex-1">Customize</button>
					<button onclick={handleRejectAll} class="btn variant-ghost-surface flex-1">Reject All</button>
					<button onclick={handleAcceptAll} class="btn variant-filled-primary flex-1">Accept All</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
