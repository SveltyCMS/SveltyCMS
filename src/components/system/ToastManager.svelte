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

	const { position = 'top-right', showProgress = true }: Props = $props();

	// Position classes mapping - fixed inset ensures proper viewport positioning
	const positionClasses: Record<string, string> = {
		'top-right': 'top-4 right-4 inset-auto items-end',
		'top-left': 'top-4 left-4 inset-auto items-start',
		'bottom-right': 'bottom-4 right-4 inset-auto items-end justify-end',
		'bottom-left': 'bottom-4 left-4 inset-auto items-start justify-end',
		'top-center': 'top-4 left-1/2 -translate-x-1/2 inset-auto items-center',
		'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 inset-auto items-center justify-end'
	};

	// Toast type configuration
	const toastConfig = {
		success: {
			gradient: 'gradient-primary',
			textColor: 'text-white',
			icon: 'mdi:check-circle',
			defaultTitle: 'Success'
		},
		warning: {
			gradient: 'gradient-warning',
			textColor: 'text-black',
			icon: 'mdi:alert',
			defaultTitle: 'Warning'
		},
		error: {
			gradient: 'gradient-error',
			textColor: 'text-white',
			icon: 'mdi:alert-circle',
			defaultTitle: 'Error'
		},
		info: {
			gradient: 'gradient-tertiary',
			textColor: 'text-white',
			icon: 'mdi:information',
			defaultTitle: 'Info'
		}
	} as const;

	type ToastType = keyof typeof toastConfig;

	// Get toast styling based on type
	function getToastClasses(type: string | undefined): string {
		if (!type || !(type in toastConfig)) {
			return 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 border border-surface-300 dark:border-surface-600';
		}
		const config = toastConfig[type as ToastType];
		return `${config.gradient} ${config.textColor}`;
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
			<Toast {toast} class="card min-w-80 max-w-100 shadow-2xl rounded-xl overflow-hidden {getToastClasses(toast.type)}">
				<!-- Toast Message Container (Skeleton v4 anatomy) -->
				<Toast.Message class="flex flex-col gap-1 p-4 pr-10 relative">
					<!-- Header with Icon and Title -->
					{#if toast.title}
						<Toast.Title class="font-bold text-base flex items-center gap-2">
							{#if getToastIcon(toast.type)}
								<iconify-icon icon={getToastIcon(toast.type)} width="22" class="shrink-0"></iconify-icon>
							{/if}
							<span>{toast.title}</span>
						</Toast.Title>
					{/if}

					<!-- Description -->
					<Toast.Description class="text-sm opacity-95 leading-relaxed">
						{toast.description}
					</Toast.Description>

					<!-- Optional Action Buttons -->
					{#if toast.action}
						<div class="mt-3 flex gap-2">
							<Toast.ActionTrigger
								class="btn-sm {toast.type === 'warning' ? 'preset-filled-surface-900' : 'preset-filled-surface-50'} text-xs font-medium"
								onclick={() => {
									toast.action?.onClick?.();
								}}
							>
								{toast.action.label}
							</Toast.ActionTrigger>
						</div>
					{/if}
				</Toast.Message>

				<!-- Close Button -->
				<Toast.CloseTrigger
					class="absolute right-2 top-2 p-1.5 rounded-full opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
					aria-label="Dismiss notification"
				>
					<iconify-icon icon="mdi:close" width={18}></iconify-icon>
				</Toast.CloseTrigger>

				<!-- Progress Bar for Auto-dismiss -->
				{#if showProgress && toast.duration && toast.duration > 0}
					<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10">
						<div class="h-full bg-current opacity-50 animate-shrink" style="animation-duration: {toast.duration}ms;"></div>
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
