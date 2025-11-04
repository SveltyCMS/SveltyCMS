<!-- 
@file src/components/GlobalLoading.svelte
@component
**Global loading overlay with contextual messages and animations**

@example
<GlobalLoading />

#### Features
- Automatically updates loading text based on current operation
- Animated loading circles with smooth performance
- Contextual loading messages
- Full-screen overlay with backdrop blur
- Accessible with ARIA labels
- Uses ParaglideJS for localization
-->

<script lang="ts">
	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';

	// i18n
	import * as m from '@src/paraglide/messages';

	// Stores
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Loading text configuration
	interface LoadingText {
		top: string;
		bottom: string;
	}

	/**
	 * Get contextual loading text based on current operation
	 */
	function getLoadingText(): LoadingText {
		const reason = globalLoadingStore.loadingReason;

		const loadingTextMap: Record<string, LoadingText> = {
			[loadingOperations.navigation]: {
				top: m.loading_navigation_top(),
				bottom: m.loading_navigation_bottom()
			},
			[loadingOperations.dataFetch]: {
				top: m.loading_dataFetch_top(),
				bottom: m.loading_dataFetch_bottom()
			},
			[loadingOperations.authentication]: {
				top: m.loading_authentication_top(),
				bottom: m.loading_authentication_bottom()
			},
			[loadingOperations.initialization]: {
				top: m.loading_initialization_top(),
				bottom: m.loading_initialization_bottom()
			},
			[loadingOperations.imageUpload]: {
				top: m.loading_imageUpload_top(),
				bottom: m.loading_imageUpload_bottom()
			},
			[loadingOperations.formSubmission]: {
				top: m.loading_formSubmission_top(),
				bottom: m.loading_formSubmission_bottom()
			}
		};

		return (
			(reason && loadingTextMap[reason]) || {
				top: m.loading_pleasewait(),
				bottom: m.loading_loading()
			}
		);
	}

	// Derived loading text
	const loadingText = $derived(getLoadingText());
</script>

<div
	class="fixed inset-0 z-[99999999] flex items-center justify-center bg-gray-950/50 backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-busy="true"
	aria-label="{loadingText.top} - {loadingText.bottom}"
>
	<!-- Animated loading circles -->
	<div
		class="absolute h-[150px] w-[150px] animate-[rotate_3s_cubic-bezier(0.26,1.36,0.74,-0.29)_infinite] rounded-full border-[7px] border-solid border-error-500 border-l-transparent border-r-transparent"
		aria-hidden="true"
	></div>
	<div
		class="absolute h-[170px] w-[170px] animate-[rotate-reverse_2s_cubic-bezier(0.26,1.36,0.74,-0.29)_infinite] rounded-full border-[6px] border-solid border-success-400 border-l-transparent border-r-transparent"
		aria-hidden="true"
	></div>
	<div
		class="absolute h-[190px] w-[190px] animate-[rotate_3s_cubic-bezier(0.26,1.36,0.74,-0.29)_infinite] rounded-full border-[5px] border-solid border-tertiary-400 border-l-transparent border-r-transparent"
		aria-hidden="true"
	></div>
	<div
		class="absolute h-[210px] w-[210px] animate-[rotate-reverse_3s_cubic-bezier(0.26,1.36,0.74,-0.29)_infinite] rounded-full border-[4px] border-solid border-surface-400 border-l-transparent border-r-transparent"
		aria-hidden="true"
	></div>

	<!-- Loading content -->
	<div class="absolute flex flex-col items-center justify-center space-y-2 rounded-full bg-transparent p-6 text-center">
		<p class="text-sm font-medium uppercase tracking-wide text-black dark:text-white">
			{loadingText.top}
		</p>
		<div class="flex items-center justify-center">
			<SveltyCMSLogo className="w-14 p-1" fill="red" />
		</div>
		<p class="text-xs uppercase text-black opacity-80 dark:text-white">
			{loadingText.bottom}
		</p>
	</div>
</div>

<style lang="postcss">
	/* Rotation animations */
	@keyframes rotate {
		from {
			transform: rotateZ(-360deg);
		}
		to {
			transform: rotateZ(0deg);
		}
	}

	@keyframes rotate-reverse {
		from {
			transform: rotateZ(360deg);
		}
		to {
			transform: rotateZ(0deg);
		}
	}
</style>
