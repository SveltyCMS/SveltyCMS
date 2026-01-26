<!--
@file src/components/system/ToastManager.svelte
@component
**Enterprise-Ready Toast Notification Manager**

A flexible, accessible toast notification system built on Skeleton v4.
Supports multiple toast types with gradient styling, progress indicators,
optional actions, and smooth animations.

@example
<ToastManager position="bottom-right" />

@features
- Type-based gradient styling (success, warning, error, info)
- Auto-dismiss with optional progress bar
- Optional action buttons in toasts
- Configurable positioning (top-right, bottom-right, etc.)
- Accessible with proper ARIA attributes
- Smooth enter/exit animations
- Dark mode support
-->

<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '@stores/store.svelte.ts';

	interface Props {
		/** Position of the toast container */
		position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
		/** Show progress bar for auto-dismiss */
		showProgress?: boolean;
	}

	const { position = 'bottom-center', showProgress = true }: Props = $props();

	// Position classes mapping - fixed inset ensures proper viewport positioning
	const positionClasses: Record<string, string> = {
		'top-right': 'top-4 right-4 items-end pointer-events-none',
		'top-left': 'top-4 left-4 items-start pointer-events-none',
		'bottom-right': 'bottom-4 right-4 items-end justify-end pointer-events-none',
		'bottom-left': 'bottom-4 left-4 items-start justify-end pointer-events-none',
		'top-center': 'top-4 left-0 w-full items-center pointer-events-none',
		'bottom-center': 'bottom-4 inset-x-0 w-full !items-center justify-end pointer-events-none'
	};

	// Toast type configuration
	const toastConfig = {
		success: {
			gradient: 'gradient-primary',
			icon: 'mdi:check-circle',
			defaultTitle: 'Success'
		},
		warning: {
			gradient: 'gradient-yellow',
			icon: 'mdi:alert',
			defaultTitle: 'Warning'
		},
		error: {
			gradient: 'gradient-error',
			icon: 'mdi:alert-circle',
			defaultTitle: 'Error'
		},
		info: {
			gradient: 'gradient-tertiary',
			icon: 'mdi:information',
			defaultTitle: 'Info'
		}
	} as const;

	type ToastType = keyof typeof toastConfig;

	// Get toast styling based on type
	function getToastGradient(type: string | undefined): string {
		if (!type || !(type in toastConfig)) {
			return 'preset-filled-surface-100-900';
		}
		// Special color for success
		if (type === 'success') return 'gradient-primary';
		return toastConfig[type as ToastType].gradient;
	}

	// Get icon for toast type
	function getToastIcon(type: string | undefined): string | null {
		if (!type || !(type in toastConfig)) return null;
		return toastConfig[type as ToastType].icon;
	}

	// Get animation direction based on position (reactive)
	const animParams = $derived.by(() => {
		if (position.includes('right')) return { x: 100, duration: 300 };
		if (position.includes('left')) return { x: -100, duration: 300 };
		if (position.includes('top')) return { y: -50, duration: 300 };
		return { y: 50, duration: 300 };
	});
</script>

<Toast.Group {toaster} class="fixed z-9999 flex {position.includes('bottom') ? 'flex-col-reverse' : 'flex-col'} gap-4 {positionClasses[position]}">
	{#snippet children(toast)}
		<div in:fly={animParams} out:fade={{ duration: 200 }} class="relative" role="alert" aria-live="polite">
			<Toast
				{toast}
				class="card w-fit min-w-[320px] md:min-w-[400px] max-w-[90vw] shadow-2xl rounded overflow-hidden {getToastGradient(
					toast.type
				)} border-none flex flex-col pointer-events-auto text-white"
			>
				<!-- Row 1: Header (Absolute Edge Alignment) -->
				<div class="grid grid-cols-[32px_1fr_32px] items-center p-4 pb-2 w-full">
					<!-- Icon -->
					<div class="flex justify-start pl-1">
						{#if getToastIcon(toast.type)}
							<iconify-icon icon={getToastIcon(toast.type)} width="28" class="shrink-0 text-white md:width-[28]"></iconify-icon>
						{/if}
					</div>

					<!-- Title -->
					<div class="text-center px-1">
						<span class="text-white font-black text-lg md:text-xl drop-shadow-md truncate block">
							{toast.title || toastConfig[toast.type as ToastType]?.defaultTitle || 'Notification'}
						</span>
					</div>

					<!-- Close Button -->
					<div class="flex justify-end pr-1">
						<Toast.CloseTrigger
							class="btn-icon rounded-full preset-filled-surface-100-900  transition-all text-white"
							aria-label="Dismiss notification"
						>
							<iconify-icon icon="mdi:close" width={18} class="md:width-[22]"></iconify-icon>
						</Toast.CloseTrigger>
					</div>
				</div>

				<!-- Row 2: Message (Balanced for One Line when possible) -->
				<div class="px-4 pb-4 text-center w-full">
					<Toast.Description
						class="text-sm md:text-base font-bold opacity-100 leading-tight md:leading-relaxed text-white drop-shadow-sm inline-block max-w-full whitespace-normal"
					>
						{@html toast.description}
					</Toast.Description>

					{#if toast.action}
						<div class="mt-4 flex justify-center gap-2">
							<Toast.ActionTrigger
								class="btn-sm bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-all px-4"
								onclick={() => {
									toast.action?.onClick?.();
								}}
							>
								{toast.action.label}
							</Toast.ActionTrigger>
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
			</Toast>
		</div>
	{/snippet}
</Toast.Group>

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
