<!-- 
@file src/routes/setup/WelcomeModal.svelte
@component
**This component displays the welcome modal**

Features:
- Close button
- Get Started button
- Close button

-->

<script lang="ts">
	import SiteName from '@components/SiteName.svelte';
	import * as m from '@src/paraglide/messages';

	// Props
	interface Props {
		close?: (result?: boolean) => void;
	}
	const { close }: Props = $props();

	// Function to close the modal and trigger the 'Get Started' action
	function handleGetStarted() {
		close?.(true);
	}
</script>

<div class="space-y-4 text-center">
	<header id="welcome-heading" class="flex flex-col items-center justify-center space-y-4">
		<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-20 w-auto" />
		<h3 class="h3">Welcome to <SiteName siteName="SveltyCMS" highlight="CMS" /> !</h3>
	</header>

	<section id="welcome-body" class="space-y-4 p-4">
		<p>{m.welcome_modal_body()}</p>
		<p class="text-sm text-surface-500 dark:text-surface-50">
			<span class="mr-1 inline-block text-xl">⏱️</span>
			{m.welcome_modal_eta()}
		</p>
	</section>

	<footer class="flex justify-center">
		<button class="dark:preset-filled-primary-500 preset-filled-tertiary-500 btn font-bold" onclick={handleGetStarted}>
			{m.welcome_modal_cta()}
			<iconify-icon icon="mdi:arrow-right" width="20" class="ml-2"></iconify-icon>
		</button>
	</footer>
</div>
