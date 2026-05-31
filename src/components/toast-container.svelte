<!--
@file src/components/toast-container.svelte
@component
**Responsive toast container with screen-aware positioning**

### Features:
- Responsive positioning based on screen size
- Swipe-to-dismiss on touch devices
- Rich color mode for vibrant success/error
- onDismiss/onAutoClose lifecycle callbacks
- Promise toast auto-transitions (loading→success/error)
- ARIA alert, high-contrast, RTL support
- Alt+T hotkey to focus toast region
- Per-toast position override
- Pause-on-hover, timer bar, flash messages
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import type { ToastPosition, ToastType } from '@src/stores/toast.svelte.ts';

	let sanitize = $state<(str: string) => string>((str) => str);

	onMount(async () => {
		const { default: DOMPurify } = await import('dompurify');
		const domSanitize = DOMPurify.sanitize;
		sanitize = domSanitize;
	});

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
		/** Use vibrant colors for error/success (sonner-style) */
		richColors?: boolean;
	}

	let { position = 'responsive', responsive = {}, limit = 5, richColors = false }: Props = $props();

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
	const styles: Record<ToastType, string> = $derived(
		richColors
			? {
					success: 'bg-emerald-600 text-white border-emerald-400',
					error: 'bg-red-600 text-white border-red-400',
					warning: 'bg-amber-500 text-white border-amber-400',
					info: 'bg-sky-600 text-white border-sky-400',
					loading: 'bg-slate-600 text-white border-slate-400',
			  }
			: {
					success: 'bg-primary-500 text-white',
					error: 'bg-error-500 text-white',
					warning: 'bg-warning-500 text-white',
					info: 'bg-info-500 text-white',
					loading: 'bg-slate-500 text-white',
			  }
	);

	const icons: Record<ToastType, string> = {
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

	// Swipe-to-dismiss state
	let swipingId = $state<string | null>(null);
	let swipeX = $state(0);

	function handleTouchStart(e: TouchEvent, id: string) {
		swipingId = id;
		swipeX = e.touches[0].clientX;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!swipingId) return;
		const delta = e.touches[0].clientX - swipeX;
		const el = document.querySelector(`[data-toast-id="${swipingId}"]`) as HTMLElement;
		if (el) {
			el.style.transform = `translateX(${delta}px)`;
			el.style.opacity = String(Math.max(0, 1 - Math.abs(delta) / 150));
		}
	}

	function handleTouchEnd(e: TouchEvent, id: string) {
		if (swipingId !== id) return;
		const delta = (e.changedTouches[0]?.clientX ?? swipeX) - swipeX;
		const el = document.querySelector(`[data-toast-id="${id}"]`) as HTMLElement;
		if (el) {
			el.style.transform = '';
			el.style.opacity = '';
		}
		if (Math.abs(delta) > 80) {
			toast.close(id);
		}
		swipingId = null;
	}

	// Hotkey: Alt+T to focus toast region
	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.altKey && e.code === 'KeyT') {
			e.preventDefault();
			toast.focusFirst();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if toast.toasts.length > 0}
	<div
		data-toast-region
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
				data-toast-id={t.id}
				animate:flip={{ duration: 300 }}
				in:fly={{ ...animDir, duration: 300 }}
				out:fade={{ duration: 200 }}
				class="pointer-events-auto w-full sm:w-80 shadow-lg rounded-lg overflow-hidden border {styles[t.type]}"
				class:mt-2={toastPos.includes('top')}
				class:mb-2={toastPos.includes('bottom')}
				onmouseenter={() => handleMouseEnter(t.id)}
				onmouseleave={() => handleMouseLeave(t.id)}
				ontouchstart={(e) => handleTouchStart(e, t.id)}
				ontouchmove={handleTouchMove}
				ontouchend={(e) => handleTouchEnd(e, t.id)}
				role="alert"
				aria-atomic="true"
				style="touch-action: pan-y; transition: transform 0.15s ease-out, opacity 0.15s ease-out;"
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
