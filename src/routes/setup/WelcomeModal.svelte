<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton-svelte';
	import SiteName from '@components/SiteName.svelte';
	import * as m from '@src/paraglide/messages';

	// Get the modal store to access modal data and close the modal
	const modalStore = getModalStore();

	// Function to close the modal and trigger the 'Get Started' action
	function handleGetStarted() {
		if ($modalStore[0]?.response) {
			$modalStore[0].response(true); // Indicate that 'Get Started' was confirmed
		}
		modalStore.close(); // Close the modal
	}

	// Function to dismiss the modal without starting
	function handleClose() {
		if ($modalStore[0]?.response) {
			$modalStore[0].response(false); // Indicate that the modal was dismissed
		}
		modalStore.close();
	}
</script>

{#if $modalStore[0]}
	<div class="card mx-auto max-w-lg space-y-4 p-4 lg:p-8" role="dialog" aria-labelledby="welcome-heading" aria-describedby="welcome-body">
		<!-- Close button -->
		<button type="button" class="btn-icon btn-sm absolute right-4 top-4" aria-label="Close welcome dialog" onclick={handleClose}>
			<iconify-icon icon="mdi:close" class="text-xl"></iconify-icon>
		</button>

		<header id="welcome-heading" class="card-header flex flex-col items-center justify-center space-y-4 text-center">
			<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-20 w-auto" />
			<h3 class="h3">Welcome to <SiteName siteName="SveltyCMS" highlight="CMS" />!</h3>
		</header>

		<section id="welcome-body" class="space-y-4 p-4 text-center">
			<p>{m.welcome_modal_body()}</p>
			<p class="text-sm text-surface-500 dark:text-surface-400">
				<span class="mr-1 inline-block">⏱️</span>
				{m.welcome_modal_eta()}
			</p>
		</section>

		<footer class="card-footer flex justify-center">
			<button class="variant-filled-primary btn" onclick={handleGetStarted}>
				{m.welcome_modal_cta()}
				<svg class="ml-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
			</button>
		</footer>
	</div>
{/if}
