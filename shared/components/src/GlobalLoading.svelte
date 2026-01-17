<!-- 
@file src/components/GlobalLoading.svelte
@component
**Enhanced Global Loading Overlay - Svelte 5 Optimized**

Full-screen loading overlay with contextual messages, progress indication, and animations.

@example
<GlobalLoading />

### Features
- Contextual loading messages based on operation type
- Animated loading circles with GPU acceleration
- Optional progress bar for determinate operations
- Cancellation support for long operations
- Reduced motion support
- Full ARIA accessibility
- Performance optimized animations
- Localized messages via ParaglideJS
-->

<script lang="ts">
	import SveltyCMSLogo from '@cms/components/system/icons/SveltyCMS_Logo.svelte';
	import * as m from '@shared/paraglide/messages';
	import { globalLoadingStore, loadingOperations } from '@shared/stores/loadingStore.svelte';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	// Loading text configuration
	interface LoadingText {
		top: string;
		bottom: string;
	}

	// State
	let prefersReducedMotion = $state(false);
	let startTime = $state(Date.now());
	let elapsedTime = $state(0);
	let intervalId: ReturnType<typeof setInterval> | null = null;

	// Derived values
	const isVisible = $derived(globalLoadingStore.isLoading);
	const progress = $derived(globalLoadingStore.progress);
	const hasProgress = $derived(progress !== null && progress !== undefined);
	const canCancel = $derived(globalLoadingStore.canCancel);

	// Get contextual loading text
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

	const loadingText = $derived(getLoadingText());

	// Format elapsed time
	function formatElapsedTime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	// Handle cancel
	function handleCancel() {
		if (canCancel && globalLoadingStore.onCancel) {
			globalLoadingStore.onCancel();
		}
	}

	// Track elapsed time
	$effect(() => {
		if (isVisible) {
			startTime = Date.now();
			elapsedTime = 0;

			intervalId = setInterval(() => {
				elapsedTime = Date.now() - startTime;
			}, 100);

			return () => {
				if (intervalId) {
					clearInterval(intervalId);
					intervalId = null;
				}
			};
		}
	});

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

{#if isVisible}
	<div
		class="fixed inset-0 z-99999999 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="loading-title"
		aria-describedby="loading-description"
		aria-busy="true"
		transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
	>
		<!-- Animated loading circles (only if motion allowed) -->
		{#if !prefersReducedMotion}
			<div class="loader loader-1" aria-hidden="true"></div>
			<div class="loader loader-2" aria-hidden="true"></div>
			<div class="loader loader-3" aria-hidden="true"></div>
			<div class="loader loader-4" aria-hidden="true"></div>
		{/if}

		<!-- Loading content -->
		<div
			class="absolute flex flex-col items-center justify-center space-y-3 rounded-2xl bg-white/90 p-8 shadow-2xl backdrop-blur-md dark:bg-gray-900/90"
			transition:scale={{ duration: prefersReducedMotion ? 0 : 300, start: 0.9 }}
		>
			<!-- Top text -->
			<p id="loading-title" class="text-sm font-medium uppercase tracking-wide text-gray-900 dark:text-white">
				{loadingText.top}
			</p>

			<!-- Logo with animation -->
			<div class="flex items-center justify-center {prefersReducedMotion ? '' : 'animate-pulse'}" aria-hidden="true">
				<SveltyCMSLogo className="w-16 p-1" fill="red" />
			</div>

			<!-- Bottom text -->
			<p id="loading-description" class="text-xs uppercase text-gray-700 dark:text-gray-300">
				{loadingText.bottom}
			</p>

			<!-- Progress bar (if available) -->
			{#if hasProgress}
				<div class="w-full" transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
					<div class="mb-1 flex items-center justify-between text-xs">
						<span class="text-gray-600 dark:text-gray-400">Progress</span>
						<span class="font-medium text-primary-500">{Math.round(progress!)}%</span>
					</div>
					<div
						class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
						role="progressbar"
						aria-valuenow={Math.round(progress!)}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							class="h-full rounded-full bg-linear-to-r from-primary-500 to-tertiary-500 transition-all duration-300"
							style="width: {progress}%"
						></div>
					</div>
				</div>
			{/if}

			<!-- Elapsed time (after 3 seconds) -->
			{#if elapsedTime > 3000}
				<div class="text-xs text-gray-500 dark:text-gray-400" transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
					Elapsed: {formatElapsedTime(elapsedTime)}
				</div>
			{/if}

			<!-- Cancel button (if cancellable) -->
			{#if canCancel}
				<button
					onclick={handleCancel}
					class="preset-outlined-error-500 btn-sm mt-2"
					type="button"
					transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
				>
					Cancel
				</button>
			{/if}
		</div>

		<!-- Screen reader announcement -->
		<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{loadingText.top}. {loadingText.bottom}.
			{#if hasProgress}
				Progress: {Math.round(progress!)} percent.
			{/if}
			{#if elapsedTime > 3000}
				Elapsed time: {formatElapsedTime(elapsedTime)}.
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Base loader styles */
	.loader {
		position: absolute;
		border-radius: 50%;
		border-style: solid;
		border-left-color: transparent;
		border-right-color: transparent;
		will-change: transform;
		transform: translateZ(0); /* GPU acceleration */
	}

	/* Individual loader animations */
	.loader-1 {
		border-color: var(--color-error-500);
		height: 150px;
		width: 150px;
		border-width: 7px;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-2 {
		border-color: var(--color-success-400);
		height: 170px;
		width: 170px;
		border-width: 6px;
		animation: rotate-reverse 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-3 {
		border-color: var(--color-tertiary-400);
		height: 190px;
		width: 190px;
		border-width: 5px;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-4 {
		border-color: var(--color-surface-400);
		height: 210px;
		width: 210px;
		border-width: 4px;
		animation: rotate-reverse 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	/* Rotation animations */
	@keyframes rotate {
		from {
			transform: translateZ(0) rotateZ(-360deg);
		}
		to {
			transform: translateZ(0) rotateZ(0deg);
		}
	}

	@keyframes rotate-reverse {
		from {
			transform: translateZ(0) rotateZ(360deg);
		}
		to {
			transform: translateZ(0) rotateZ(0deg);
		}
	}

	/* Respect reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.loader {
			animation: none !important;
		}
	}
</style>
