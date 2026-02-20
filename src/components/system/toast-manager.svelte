<!--
@file src/components/system/ToastManager.svelte
@component
**Enterprise-Ready Toast Notification Manager**

A flexible, accessible toast notification system.
Supports multiple toast types with gradient styling, progress indicators,
optional actions, and smooth animations.

@example
<ToastManager position="bottom-right" />

@features
- Type-based gradient styling (success, warning, error, info)
- Auto-dismiss with optional progress bar
- Optional actions in toasts
- Configurable positioning
- Accessible (ARIA)
- Smooth Svelte transitions
-->

<script lang="ts">
	import Sanitize from '@src/utils/sanitize.svelte';
	interface Props {
		/** Position of the toast container */
		position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
		/** Show progress bar for auto-dismiss */
		showProgress?: boolean;
	}

	let { position = 'bottom-center', showProgress = true }: Props = $props();

	// Position classes mapping - fixed inset ensures proper viewport positioning
	const positionClasses: Record<string, string> = {
		'top-right': 'top-4 right-4 items-end pointer-events-none',
		'top-left': 'top-4 left-4 items-start pointer-events-none',
		'bottom-right': 'bottom-4 right-4 items-end justify-end pointer-events-none',
		'bottom-left': 'bottom-4 left-4 items-start justify-end pointer-events-none',
		'top-center': 'top-4 left-0 w-full items-center pointer-events-none',
		'bottom-center': 'bottom-4 inset-x-0 w-full !items-center justify-center pointer-events-none'
	};

	// Toast type configuration
	const toastConfig = {
		success: {
			icon: 'mdi:check-circle',
			defaultTitle: 'Success'
		},
		warning: {
			icon: 'mdi:alert',
			defaultTitle: 'Warning'
		},
		error: {
			icon: 'mdi:alert-circle',
			defaultTitle: 'Error'
		},
		info: {
			icon: 'mdi:information',
			defaultTitle: 'Info'
		}
	} as const;

	type ToastType = keyof typeof toastConfig;

	// Get toast styling based on type
	function getToastGradient(type: string | undefined): string {
		switch (type) {
			case 'success':
				return 'bg-gradient-to-r from-primary-500 to-primary-700';
			case 'warning':
				return 'bg-gradient-to-r from-warning-500 to-warning-700';
			case 'error':
				return 'bg-gradient-to-r from-error-500 to-error-700';
			case 'info':
				return 'bg-gradient-to-r from-tertiary-500 to-tertiary-700';
			default:
				return 'bg-gradient-to-r from-secondary-500 to-secondary-700';
		}
	}

	// Get icon for toast type
	function getToastIcon(type: string | undefined): string | null {
		if (!(type && type in toastConfig)) {
			return null;
		}
		return toastConfig[type as ToastType].icon;
	}

	// Get animation direction based on position (reactive)
	const animParams = $derived.by(() => {
		if (position.includes('right')) {
			return { x: 20, duration: 200 };
		}
		if (position.includes('left')) {
			return { x: -20, duration: 200 };
		}
		if (position.includes('top')) {
			return { y: -20, duration: 200 };
		}
		return { y: 20, duration: 200 };
	});
</script>

<div class="fixed z-9999 flex {position.includes('bottom') ? 'flex-col-reverse' : 'flex-col'} gap-2 {positionClasses[position]}">
	{#each toaster.toasts as toast (toast.id)}
		<div in:fly={animParams} out:fade={{ duration: 200 }} class="relative" role="alert" aria-live="polite">
			<div
				class="w-fit min-w-[320px] md:min-w-[400px] max-w-[90vw] shadow-2xl rounded overflow-hidden {getToastGradient(
					toast.type
				)} border-none flex flex-col pointer-events-auto text-white"
			>
				<!-- Row 1: Header (Absolute Edge Alignment) -->
				<div class="grid grid-cols-[32px_1fr_32px] items-center w-full pt-1">
					<!-- Icon -->
					<div class="flex justify-start pl-2">
						{#if getToastIcon(toast.type)}
							<iconify-icon icon={getToastIcon(toast.type)} width="24" class="shrink-0 text-white"></iconify-icon>
						{/if}
					</div>

					<!-- Title -->
					<div class="text-center px-1">
						<span class="text-white font-black text-lg md:text-xl drop-shadow-md truncate block">
							{toast.title || toastConfig[toast.type as ToastType]?.defaultTitle || 'Notification'}
						</span>
					</div>

					<!-- Close Button -->
					<div class="flex justify-end pr-2">
						<button
							onclick={() => toaster.close(toast.id)}
							class="rounded-full bg-white/20 hover:bg-white/40 shadow-sm backdrop-blur-sm transition-all text-white p-1 flex items-center justify-center"
							aria-label="Dismiss notification"
						>
							<iconify-icon icon="mdi:close" width={16}></iconify-icon>
						</button>
					</div>
				</div>

				<!-- Row 2: Message -->
				<div class="px-4 pb-4 pt-1 text-center w-full">
					<div
						class="text-sm md:text-base font-bold opacity-100 leading-tight md:leading-relaxed text-white drop-shadow-sm inline-block max-w-full whitespace-normal"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html DOMPurify.sanitize(toast.description)}
					</div>

					{#if toast.action}
						<div class="mt-4 flex justify-center gap-2">
							<button
								onclick={toast.action.onClick}
								class="bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-all px-4 py-1"
							>
								{toast.action.label}
							</button>
						</div>
					{/if}
				</div>

				<!-- Row 3: Timer / Progress Bar -->
				{#if showProgress}
					{@const duration = toast.duration || 5000}
					<div class="absolute bottom-0 left-0 h-1.5 w-full bg-black/10 overflow-hidden">
						<div class="h-full bg-white/40 animate-shrink" style="animation-duration: {duration}ms;"></div>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	/* Progress bar shrink animation */
	@keyframes shrink {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}

	.animate-shrink {
		animation: shrink linear forwards;
	}
</style>
