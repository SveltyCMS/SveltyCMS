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

	// Get contextual loading text based on current operation
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
			},
			[loadingOperations.configSave]: {
				top: m.loading_configSave_top(),
				bottom: m.loading_configSave_bottom()
			},
			[loadingOperations.roleManagement]: {
				top: m.loading_roleManagement_top(),
				bottom: m.loading_roleManagement_bottom()
			},
			[loadingOperations.permissionUpdate]: {
				top: m.loading_permissionUpdate_top(),
				bottom: m.loading_permissionUpdate_bottom()
			},
			[loadingOperations.tokenGeneration]: {
				top: m.loading_tokenGeneration_top(),
				bottom: m.loading_tokenGeneration_bottom()
			},
			[loadingOperations.collectionLoad]: {
				top: m.loading_collectionLoad_top(),
				bottom: m.loading_collectionLoad_bottom()
			},
			[loadingOperations.widgetInit]: {
				top: m.loading_widgetInit_top(),
				bottom: m.loading_widgetInit_bottom()
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
	<div class="loader loader-1 border-error-500 h-[150px] w-[150px] border-[7px]" aria-hidden="true"></div>
	<div class="loader loader-2 border-success-400 h-[170px] w-[170px] border-[6px]" aria-hidden="true"></div>
	<div class="loader loader-3 border-tertiary-400 h-[190px] w-[190px] border-[5px]" aria-hidden="true"></div>
	<div class="loader loader-4 border-surface-400 h-[210px] w-[210px] border-4" aria-hidden="true"></div>

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

<style>
	/* Base loader styles */
	.loader {
		position: absolute;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		margin: auto;
		z-index: 99999999;
		border-radius: 50%;
		border-style: solid;
		border-color: transparent;
		box-sizing: border-box;
	}

	/* Individual loader animations */
	.loader-1 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-2 {
		animation: rotate-reverse 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-3 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-4 {
		animation: rotate-reverse 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

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
