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
		'bottom-center': 'bottom-4 left-0 w-full items-center justify-end pointer-events-none'
	};

	// Toast type configuration
	const toastConfig = {
		success: {
			color: 'text-primary-500',
			border: 'border-l-4 border-l-primary-500',
			icon: 'mdi:check-circle',
			defaultTitle: 'Success'
		},
		warning: {
			color: 'text-warning-500',
			border: 'border-l-4 border-l-warning-500',
			icon: 'mdi:alert',
			defaultTitle: 'Warning'
		},
		error: {
			color: 'text-error-500',
			border: 'border-l-4 border-l-error-500',
			icon: 'mdi:alert-circle',
			defaultTitle: 'Error'
		},
		info: {
			color: 'text-tertiary-500',
			border: 'border-l-4 border-l-tertiary-500',
			icon: 'mdi:information',
			defaultTitle: 'Info'
		}
	} as const;

	type ToastType = keyof typeof toastConfig;

	// Get toast styling based on type
	function getToastClasses(type: string | undefined): string {
		if (!type || !(type in toastConfig)) {
			return 'border-l-4 border-l-surface-500';
		}
		const config = toastConfig[type as ToastType];
		return config.border;
	}

	function getIconClass(type: string | undefined): string {
		if (!type || !(type in toastConfig)) return 'text-surface-900 dark:text-surface-100';
		return toastConfig[type as ToastType].color;
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

<Toast.Group {toaster} class="fixed z-9999 flex {position.includes('bottom') ? 'flex-col-reverse' : 'flex-col'} gap-3 {positionClasses[position]}">
	{#snippet children(toast)}
		<div in:fly={animParams} out:fade={{ duration: 200 }} class="relative" role="alert" aria-live="polite">
			<Toast
				{toast}
				class="card w-fit min-w-[320px] md:min-w-[400px] max-w-[90vw] shadow-xl rounded-lg overflow-hidden preset-filled-surface-100-900 border border-surface-200 dark:border-surface-700 {getToastClasses(
					toast.type
				)} flex flex-col pointer-events-auto"
			>
				<!-- Row 1: Header (Icon + Title + Close) -->
				<div class="flex items-start justify-between p-4 pb-2 gap-3">
					<div class="flex items-center gap-3 font-bold text-base">
						{#if getToastIcon(toast.type)}
							<iconify-icon icon={getToastIcon(toast.type)} width="24" class="shrink-0 {getIconClass(toast.type)}"></iconify-icon>
						{/if}
						<span class="text-surface-900 dark:text-surface-50"
							>{toast.title || toastConfig[toast.type as ToastType]?.defaultTitle || 'Notification'}</span
						>
					</div>
					<Toast.CloseTrigger
						class="p-1 -mr-2 -mt-1 rounded-full opacity-60 hover:opacity-100 hover:bg-surface-500/10 transition-opacity text-surface-900 dark:text-surface-100"
						aria-label="Dismiss notification"
					>
						<iconify-icon icon="mdi:close" width={18}></iconify-icon>
					</Toast.CloseTrigger>
				</div>

				<!-- Row 2: Message -->
				<div class="px-4 pb-4">
					<Toast.Description class="text-sm opacity-80 leading-relaxed text-surface-700 dark:text-surface-300 ml-9">
						{toast.description}
					</Toast.Description>

					{#if toast.action}
						<div class="mt-3 flex gap-2 ml-9">
							<Toast.ActionTrigger
								class="btn-sm preset-filled-surface-200 dark:preset-filled-surface-700 hover:preset-filled-surface-300 dark:hover:preset-filled-surface-600 text-xs font-medium"
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
				{#if showProgress && toast.duration && toast.duration > 0}
					<div class="h-1 w-full bg-surface-200 dark:bg-surface-700 mt-auto">
						<div
							class="h-full {getIconClass(toast.type).replace('text-', 'bg-')} opacity-100 animate-shrink"
							style="animation-duration: {toast.duration}ms;"
						></div>
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
