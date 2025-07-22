<!-- 
@file src/components/GlobalLoading.svelte
@component
**Global loading component that automatically shows appropriate loading text based on current operation**

@example
<GlobalLoading />

### Features:
- Automatically updates loading text based on global loading state
- Animated loading circles with better performance
- Contextual loading messages
- Uses ParaglideJS for localization
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	let isAnimating = $state(true);
	let animationTimeout: ReturnType<typeof setTimeout> | null = null;
	const animationDuration = 60000; // 60 seconds

	// Get contextual loading text based on current operation
	const loadingText = $derived(() => {
		const reason = globalLoadingStore.loadingReason;
		switch (reason) {
			case loadingOperations.navigation:
				return {
					top: 'Navigating',
					bottom: 'Loading page...'
				};
			case loadingOperations.dataFetch:
				return {
					top: 'Fetching data',
					bottom: 'Please wait...'
				};
			case loadingOperations.authentication:
				return {
					top: 'Authenticating',
					bottom: 'Signing you in...'
				};
			case loadingOperations.initialization:
				return {
					top: 'Initializing',
					bottom: 'Setting up application...'
				};
			case loadingOperations.imageUpload:
				return {
					top: 'Uploading',
					bottom: 'Processing files...'
				};
			case loadingOperations.formSubmission:
				return {
					top: 'Submitting',
					bottom: 'Processing request...'
				};
			default:
				return {
					top: m.loading_pleasewait(),
					bottom: m.loading_loading()
				};
		}
	});

	onMount(() => {
		// Stop animations after the specified duration
		animationTimeout = setTimeout(() => {
			isAnimating = false;
		}, animationDuration);
	});

	onDestroy(() => {
		// Clean up the timeout if the component is destroyed before it finishes
		if (animationTimeout) {
			clearTimeout(animationTimeout);
		}
	});
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 shadow-2xl backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-label={`Loading: ${loadingText.top} - ${loadingText.bottom}`}
>
	{#if isAnimating}
		<div class="relative h-[150px] w-[150px] rounded-full border-[7px] border-error-500 border-x-transparent" id="loader"></div>
		<div class="absolute h-[170px] w-[170px] rounded-full border-[6px] border-success-400 border-x-transparent" id="loader2"></div>
		<div class="absolute h-[190px] w-[190px] rounded-full border-[5px] border-tertiary-400 border-x-transparent" id="loader3"></div>
		<div class="absolute h-[210px] w-[210px] rounded-full border-[4px] border-surface-400 border-x-transparent" id="loader4"></div>
	{/if}
	<div class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white">
		<div class="text-center text-sm font-medium">{loadingText.top}</div>
		<div class="my-2"><SveltyCMSLogo className="w-14 p-1" fill="red" /></div>
		<div class="text-center text-xs opacity-80">{loadingText.bottom}</div>
	</div>
</div>

<style lang="postcss">
	#loader {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader2 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader3 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader4 {
		animation: rotate2 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	@keyframes rotate {
		0% {
			transform: rotateZ(-360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
	@keyframes rotate2 {
		0% {
			transform: rotateZ(360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
</style>
