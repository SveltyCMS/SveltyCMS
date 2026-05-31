<!--
 @file src/plugins/cookie-consent/cookie-consent.svelte
 @component Cookie Consent Banner – GDPR compliant.
 Displays a granular cookie selection UI with accessibility and Svelte 5 runes.
-->

<script lang="ts">
  import Button from "@components/ui/button.svelte";
  import Toggle from "@components/ui/toggle.svelte";
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
    cookie_necessary_title,
  } from "@src/paraglide/messages";
  import { consentStore } from "@src/stores/consent-store.svelte";
  import { fade, slide } from "svelte/transition";

  // Banner and detail visibility state
  let showBanner = $state(false);
  let showDetails = $state(false);

  // Local "draft" preferences for the customization view
  let preferences = $state({
    analytics: consentStore.analytics,
    marketing: consentStore.marketing,
  });

  // Trigger banner appearance after a short delay if no response yet
  $effect(() => {
    if (!consentStore.responded) {
      const timer = setTimeout(() => {
        showBanner = true;
      }, 600);
      return () => clearTimeout(timer);
    }
  });

  // Update local state if the store changes (e.g., from another component)
  $effect(() => {
    preferences.analytics = consentStore.analytics;
    preferences.marketing = consentStore.marketing;
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
    consentStore.update({
      analytics: preferences.analytics,
      marketing: preferences.marketing,
    });
    showBanner = false;
  }

  // Allows re-opening the banner from an external component (like a footer link)
  export function openConsentBanner() {
    showDetails = false;
    showBanner = true;
  }
</script>

{#if showBanner && !consentStore.responded}
  <div
    transition:fade={{ duration: 300 }}
    class="fixed inset-x-0 bottom-0 `z-9999 p-4 md:bottom-6 md:left-6 md:right-auto md:w-full md:max-w-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cookie-heading"
    aria-describedby="cookie-description"
  >
    <div
      class="rounded-xl border border-surface-200 bg-white p-3 shadow-2xl dark:border-surface-700 dark:bg-surface-900"
    >
      <!-- Header -->
      <div class="flex items-start gap-3">
        <div class="text-5xl" aria-hidden="true">🍪</div>
        <div class="flex-1 text-center">
          <h2
            id="cookie-heading"
            class="text-xl font-bold text-surface-900 dark:text-white"
          >
            {cookie_heading()}
          </h2>
          
          <p
            id="cookie-description"
            class="mt-2 text-sm text-surface-600 dark:text-surface-300"
          >
            {cookie_description()}
          </p>
        </div>
      </div>

      {#if showDetails}
        <div
          transition:slide
          class="mt-4 space-y-5 border-t border-surface-200 py-5 dark:border-surface-700"
        >
          <!-- Necessary (always on) -->
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-surface-900 dark:text-white">
                {cookie_necessary_title()}
              </div>
              <div class="text-xs text-surface-500">{cookie_necessary_desc()}</div>
            </div>
            <Toggle value={true} disabled />
          </div>

          <!-- Analytics -->
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-surface-900 dark:text-white">
                {cookie_analytics_title()}
              </div>
              <div class="text-xs text-surface-500">{cookie_analytics_desc()}</div>
            </div>
            <Toggle bind:value={preferences.analytics} />
          </div>

          <!-- Marketing -->
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-surface-900 dark:text-white">
                {cookie_marketing_title()}
              </div>
              <div class="text-xs text-surface-500">{cookie_marketing_desc()}</div>
            </div>
            <Toggle bind:value={preferences.marketing} />
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="mt-6 flex flex-col gap-3 sm:flex-row">
        {#if showDetails}
          <Button
            onclick={handleSavePreferences}
            variant="primary"
            class="flex-1"
          >
            {cookie_button_save()}
          </Button>
        {:else}
          <Button
            onclick={() => (showDetails = true)}
            variant="secondary"
            class="flex-1"
          >
            {cookie_button_customize()}
          </Button>
          <Button
            onclick={handleRejectAll}
            variant="secondary"
            class="flex-1"
          >
            {cookie_button_reject()}
          </Button>
          <Button
            onclick={handleAcceptAll}
            variant="primary"
            class="flex-1"
          >
            {cookie_button_accept()}
          </Button>
        {/if}
      </div>

      <!-- Privacy Link -->
      <p class="mt-2 text-center text-xs text-surface-500">
        <a href="/privacy-policy" class="hover:underline hover:text-primary-500"
          >Privacy Policy</a
        >
      </p>
    </div>
  </div>
{/if}
