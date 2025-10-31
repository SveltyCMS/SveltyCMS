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
	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Stores
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Get contextual loading text based on current operation
	// Provide a callable function that returns the current loading text.
	function loadingText() {
		const reason = globalLoadingStore.loadingReason;
		switch (reason) {
			case loadingOperations.navigation:
				return { top: 'Navigating', bottom: 'Loading page...' };
			case loadingOperations.dataFetch:
				return { top: 'Fetching data', bottom: 'Please wait...' };
			case loadingOperations.authentication:
				return { top: 'Authenticating', bottom: 'Signing you in...' };
			case loadingOperations.initialization:
				return { top: 'Initializing', bottom: 'Setting up application...' };
			case loadingOperations.imageUpload:
				return { top: 'Uploading', bottom: 'Processing files...' };
			case loadingOperations.formSubmission:
				return { top: 'Submitting', bottom: 'Processing request...' };
			default:
				// Fallback to localized default messages
				return { top: m.loading_pleasewait(), bottom: m.loading_loading() };
		}
	}
</script>

<div
	class="fixed inset-0 z-[99999999] flex items-center justify-center bg-gray-950/50 shadow-2xl backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-label={`Loading: ${loadingText().top} - ${loadingText().bottom}`}
>
	<div class="loader-1"></div>
	<div class="loader-2"></div>
	<div class="loader-3"></div>
	<div class="loader-4"></div>

	<div class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white">
		<div class="text-center text-sm font-medium">{loadingText().top}</div>
		<div class="my-2"><SveltyCMSLogo className="w-14 p-1" fill="red" /></div>
		<div class="text-center text-xs opacity-80">{loadingText().bottom}</div>
	</div>
</div>

<style lang="postcss">
	/* Base styles for loaders */
	.loader-1,
	.loader-2,
	.loader-3,
	.loader-4 {
		position: absolute;
		border-radius: 50%;
		border-style: solid;
		border-left-color: transparent;
		border-right-color: transparent;
	}

	/* Individual loader styles and animations */
	.loader-1 {
		@apply h-[150px] w-[150px] border-[7px] border-error-500;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-2 {
		@apply h-[170px] w-[170px] border-[6px] border-success-400;
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-3 {
		@apply h-[190px] w-[190px] border-[5px] border-tertiary-400;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-4 {
		@apply h-[210px] w-[210px] border-[4px] border-surface-400;
		animation: rotate2 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	/* Keyframes remain the same */
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
