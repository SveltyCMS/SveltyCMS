<!--
@file src/components/toast-container.svelte
@component
**Responsive toast container with screen-aware positioning**

### Features:
- Responsive positioning based on screen size
- ARIA alert, high-contrast, RTL support
- Custom responsive breakpoints
- Limit the number of visible toasts
- Per-toast position or fall back to container position
- Animation directions based on position
- Toast styling
- Icons for different toast types
- Pause and resume toast functionality
- Dismiss toast functionality
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import { sanitize } from 'isomorphic-dompurify';
	import type { ToastPosition } from '@src/stores/toast.svelte.ts';

	interface Props {
		/** Default position - 'responsive' adapts to screen size */
		position?: ToastPosition;
		/** Custom responsive breakpoints */
		responsive?: {
			mobile?: Exclude<ToastPosition, 'responsive'>;
			tablet?: Exclude<ToastPosition, 'responsive'>;
			desktop?: Exclude<ToastPosition, 'responsive'>;
		};
		limit?: number;
	}

	let { position = 'responsive', responsive = {}, limit = 5 }: Props = $props();

	// Merge custom responsive config with defaults
	$effect(() => {
		toast.setResponsiveConfig({
			mobile: responsive.mobile ?? 'bottom-center',
			tablet: responsive.tablet ?? 'bottom-right',
			desktop: responsive.desktop ?? 'bottom-right'
		});
	});

	// Reactive position based on screen size
	const effectivePosition = $derived(toast.getEffectivePosition(position));

	// Position CSS classes
	const positionClasses: Record<Exclude<ToastPosition, 'responsive'>, string> = {
		'top-left': 'top-4 left-4 items-start',
		'top-right': 'top-4 right-4 items-end',
		'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
		'bottom-left': 'bottom-4 left-4 items-start',
		'bottom-right': 'bottom-4 right-4 items-end',
		'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center'
	};

	// Animation directions based on position and RTL
	const isRTL = $derived(browser && document ? document.documentElement.dir === 'rtl' : false);
	const directions = $derived.by(() => {
		const pos = effectivePosition;
		const xOffset = isRTL ? -20 : 20; // Flip X direction in RTL
		return {
			'top-left': { x: -xOffset, y: 0 },
			'top-right': { x: xOffset, y: 0 },
			'top-center': { x: 0, y: -20 },
			'bottom-left': { x: -xOffset, y: 0 },
			'bottom-right': { x: xOffset, y: 0 },
			'bottom-center': { x: 0, y: 20 }
		}[pos];
	});

	// Toast styling
	const styles = {
		success: 'bg-primary-500 text-white',
		error: 'bg-error-500 text-white',
		warning: 'bg-warning-500 text-white',
		info: 'bg-info-500 text-white',
		loading: 'bg-slate-500 text-white'
	};

	const icons = {
		success: 'mdi:check-circle',
		error: 'mdi:alert-circle',
		warning: 'mdi:alert',
		info: 'mdi:information',
		loading: 'mdi:loading'
	};

	// Get per-toast position or fall back to container position
	function getToastPosition(toastPosition?: ToastPosition): Exclude<ToastPosition, 'responsive'> {
		return toast.getEffectivePosition(toastPosition ?? position);
	}

	// Reactive pause state check
	const isToastPaused = (id: string) => toast.pausedIds.has(id);

	const visibleToasts = $derived(toast.sortedToasts.slice(0, limit));

	function handleMouseEnter(id: string) {
		toast.pause(id);
	}

	function handleMouseLeave(id: string) {
		toast.resume(id);
	}
</script>

{#if toast.toasts.length > 0}
	<div
		class="fixed z-9999 flex flex-col gap-2 {positionClasses[effectivePosition]} pointer-events-none w-full sm:w-auto px-4 sm:px-0"
		role="region"
		aria-label="Notifications"
		aria-live="polite"
		aria-atomic="false"
	>
		{#each visibleToasts as t (t.id)}
			{@const toastPos = getToastPosition(t.position)}
			{@const animDir = directions}

			<div
				animate:flip={{ duration: 300 }}
				in:fly={{ ...animDir, duration: 300 }}
				out:fade={{ duration: 200 }}
				class="pointer-events-auto w-full sm:w-80 shadow-lg rounded-lg overflow-hidden {styles[t.type]}"
				class:mt-2={toastPos.includes('top')}
				class:mb-2={toastPos.includes('bottom')}
				onmouseenter={() => handleMouseEnter(t.id)}
				onmouseleave={() => handleMouseLeave(t.id)}
				role="alert"
				aria-atomic="true"
			>
				<div class="p-3 sm:p-4">
					<div class="flex items-start gap-3">
						<iconify-icon icon={icons[t.type]} class="shrink-0 text-lg sm:text-xl {t.type === 'loading' ? 'animate-spin' : ''}"></iconify-icon>

						<div class="flex-1 min-w-0">
							{#if t.title}
								<h3 class="font-semibold text-sm mb-0.5">{t.title}</h3>
							{/if}
							<p class="text-xs sm:text-sm opacity-90 wrap-break-word">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html sanitize(t.message)}
							</p>

							{#if t.action}
								<button
									onclick={() => {
										t.action?.onClick();
										toast.close(t.id);
									}}
									class="mt-2 text-xs font-medium bg-white/20 hover:bg-white/30 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded transition-colors"
								>
									{t.action.label}
								</button>
							{/if}
						</div>

						<button
							onclick={() => toast.close(t.id)}
							class="shrink-0 opacity-70 hover:opacity-100 transition-opacity -mr-1 -mt-1 sm:mr-0 sm:mt-0 p-1"
							aria-label="Dismiss notification"
						>
							<iconify-icon icon="mdi:close" class="text-lg"></iconify-icon>
						</button>
					</div>
				</div>

				{#if t.duration !== Infinity && !isToastPaused(t.id)}
					<div class="h-1 bg-black/20">
						<div class="h-full bg-white/40 origin-left" style="animation: shrink {t.remainingTime}ms linear forwards"></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes shrink {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	@media (prefers-contrast: high) {
		div[role='alert'] {
			border: 2px solid currentColor;
			outline: 2px solid transparent;
			outline-offset: 2px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		div[role='alert'] {
			animation: none !important;
			transition: none !important;
		}
		.origin-left {
			display: none; /* Hide progress bar if reduced motion is preferred */
		}
	}
</style>
