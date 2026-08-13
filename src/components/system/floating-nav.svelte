<!--
@file src/components/system/floating-nav.svelte
@component
**Floating navigation component for quick access to different pages**

Radial FAB menu driven by `floatingNavStore` (shared with PageTitle favorites).
System defaults load on first start; each user can enable/disable them and add
custom page favorites. Fixed anchors (Home + Settings) always remain so an
empty custom set never breaks the CMS — the radial still opens with a centered
Home button and Settings available.

### Features
- Per-user localStorage prefs via floatingNavStore
- System defaults + custom favorites (synced with PageTitle star)
- Empty-safe: fixed Home center (+ Settings) always present
- Draggable FAB, keyboard nav, reduced motion, ARIA
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { fade } from 'svelte/transition';

	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	// Auth
	import type { User } from '@src/databases/auth/types';
	// Stores
	import { floatingNavStore, type FloatingNavItem } from '@src/stores/floating-nav-store.svelte.ts';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import { motion } from '@src/utils/admin-transitions';
	import { logger } from '@utils/logger';
	// Modals/Tooltips
	import { modalState } from '@utils/modal.svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import { linear } from 'svelte/easing';
	import { browser } from '$app/env';
	import { page } from '$app/state';

	// Constants
	const BUTTON_RADIUS = 25;
	const EDGE_MARGIN = 12;
	const MENU_RADIUS = 160;
	const DRAG_THRESHOLD = 10;
	const MOTION_MS_DEFAULT = 200;
	const VIBRATE_OPEN_MS = 10;
	const VIBRATE_CLOSE_MS = 5;

	// Get user from page data
	const user = $derived(page.data.user as User | undefined);

	// Keep store scoped to the signed-in user (per-user prefs)
	$effect(() => {
		floatingNavStore.bindUser(user ?? null);
	});

	/** Resolved radial endpoints — never empty (Home always first / center). */
	const endpoints = $derived.by((): FloatingNavItem[] => {
		return floatingNavStore.resolveEndpoints(user ?? null);
	});

	/** Spokes only (index 0 = fixed center Home). */
	const spokeEndpoints = $derived(endpoints.slice(1));

	// State
	let showRoutes = $state(false);
	let prefersReducedMotion = $state(false);
	let motionMs = $state(MOTION_MS_DEFAULT);

	let buttonInfo = $state({
		x: 0,
		y: 0,
		radius: BUTTON_RADIUS
	});

	let center = $state({
		x: browser ? window.innerWidth / 2 : 0,
		y: browser ? window.innerHeight / 2 : 0
	});

	// Refs
	let firstLine: SVGLineElement | undefined = $state(undefined);
	let firstCircle: HTMLDivElement | undefined = $state(undefined);
	let svg: SVGSVGElement | undefined = $state(undefined);
	const circles: (HTMLAnchorElement | undefined)[] = $state([]);

	// Calculate endpoint positions for spokes only (center Home is fixed at menu center)
	const spokesWithPos = $derived.by(() => {
		const n = spokeEndpoints.length;
		if (n === 0) return [];

		return spokeEndpoints.map((endpoint, index) => {
			// Even spacing around the ring; avoid divide-by-zero (n >= 1 here)
			const ANGLE = ((Math.PI * 2) / n) * index - Math.PI / 2;
			const X = center.x + MENU_RADIUS * Math.cos(ANGLE);
			const Y = center.y + MENU_RADIUS * Math.sin(ANGLE);
			return { ...endpoint, x: X, y: Y, angle: ANGLE };
		});
	});

	// Helper functions
	function getBasePath(pathname: string): string {
		const PARAMS = Object.values(page.params);
		const REPLACED = PARAMS.reduce((acc, param) => acc.replace(param, ''), pathname);
		return PARAMS.length > 0 ? REPLACED : pathname;
	}

	function isRightToLeft(): boolean {
		return browser && document.documentElement.dir === 'rtl';
	}

	function vibrate(duration: number): void {
		if (browser) {
			try {
				navigator.vibrate?.(duration);
			} catch {
				// Vibration not supported
			}
		}
	}

	function loadSavedPosition(): void {
		if (!browser) {
			return;
		}

		try {
			const NAVIGATION_INFO = JSON.parse(localStorage.getItem('navigation') || '{}');
			const KEY = getBasePath(page.url.pathname);
			const SAVED = NAVIGATION_INFO[KEY] as { x?: number; y?: number } | undefined;

			if (SAVED && typeof SAVED.x === 'number' && typeof SAVED.y === 'number') {
				buttonInfo = { x: SAVED.x, y: SAVED.y, radius: BUTTON_RADIUS };
			} else {
				buttonInfo = {
					x: window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN),
					y: window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN),
					radius: BUTTON_RADIUS
				};
			}
		} catch {
			buttonInfo = {
				x: window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN),
				y: window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN),
				radius: BUTTON_RADIUS
			};
		}
	}

	function savePosition(): void {
		if (!browser) {
			return;
		}

		try {
			const NAVIGATION_INFO = JSON.parse(localStorage.getItem('navigation') || '{}');
			const KEY = getBasePath(page.url.pathname);
			NAVIGATION_INFO[KEY] = { x: buttonInfo.x, y: buttonInfo.y };
			localStorage.setItem('navigation', JSON.stringify(NAVIGATION_INFO));
		} catch (error) {
			logger.error('Failed to save position:', error);
		}
	}

	async function handleResize(): Promise<void> {
		if (!browser) {
			return;
		}

		const MIN_X = BUTTON_RADIUS + EDGE_MARGIN;
		const MAX_X = window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN);
		const MIN_Y = BUTTON_RADIUS + EDGE_MARGIN;
		const MAX_Y = window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN);

		buttonInfo.x = Math.min(Math.max(buttonInfo.x, MIN_X), MAX_X);
		buttonInfo.y = Math.min(Math.max(buttonInfo.y, MIN_Y), MAX_Y);
		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

		if (firstLine && firstCircle) {
			firstLine.setAttribute('x1', firstCircle.offsetLeft.toString());
			firstLine.setAttribute('y1', firstCircle.offsetTop.toString());
			await tick();
			firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
		}
	}

	function closeMenu(): void {
		if (!showRoutes) {
			return;
		}
		showRoutes = false;
		vibrate(VIBRATE_CLOSE_MS);
		setTimeout(() => firstCircle?.focus?.(), 0);
	}

	async function toggleMenuOpen(): Promise<void> {
		if (showRoutes) {
			closeMenu();
		} else {
			center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
			await tick();
			showRoutes = true;
			vibrate(VIBRATE_OPEN_MS);
			await tick();
			circles[0]?.focus?.();
		}
	}

	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			closeMenu();
		}
	}

	function handleNavigateToEndpoint(): void {
		modeTransitionGuard.setMode('view');
		showRoutes = false;
		// Navigation is handled by <a> tag href attribute
	}

	function handleNavigateHome(): void {
		modeTransitionGuard.setMode('view');
		modalState.clear();
		ui.toggle('leftSidebar', 'hidden');
		showRoutes = false;
		// Navigation will be handled by <a> tag
	}

	// Drag functionality
	function drag(node: HTMLDivElement) {
		let moved = false;
		let dragging = false;
		let startX = 0;
		let startY = 0;
		let startButtonX = 0;
		let startButtonY = 0;

		node.onpointerdown = (e) => {
			startX = e.clientX;
			startY = e.clientY;
			startButtonX = buttonInfo.x;
			startButtonY = buttonInfo.y;
			moved = false;
			dragging = false;
			node.setPointerCapture(e.pointerId);

			node.onpointermove = (moveEvent) => {
				const DX = moveEvent.clientX - startX;
				const DY = moveEvent.clientY - startY;
				const DISTANCE = Math.sqrt(DX * DX + DY * DY);

				if (!dragging && DISTANCE > DRAG_THRESHOLD) {
					dragging = true;
				}

				if (dragging) {
					moved = true;

					buttonInfo = {
						...buttonInfo,
						x: startButtonX + DX,
						y: startButtonY + DY
					};

					if (firstLine) {
						firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					}
				}
			};
		};

		node.onpointerup = async (e) => {
			if (!dragging) {
				await toggleMenuOpen();
			}

			node.onpointermove = null;
			try {
				if (node.hasPointerCapture(e.pointerId)) {
					node.releasePointerCapture(e.pointerId);
				}
			} catch {
				// Ignore if already released
			}

			if (!moved) {
				return;
			}

			// Snap to nearest edge
			const DISTANCES = [buttonInfo.x, window.innerWidth - buttonInfo.x, buttonInfo.y, window.innerHeight - buttonInfo.y];

			const NEAREST_EDGE_INDEX = DISTANCES.indexOf(Math.min(...DISTANCES));
			let promise: Promise<void> = Promise.resolve();

			switch (NEAREST_EDGE_INDEX) {
				case 0: // Left edge
					promise = motion([buttonInfo.x], [BUTTON_RADIUS + EDGE_MARGIN], motionMs, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) {
							firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
						}
					});
					break;
				case 1: // Right edge
					promise = motion([buttonInfo.x], [window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN)], motionMs, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) {
							firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
						}
					});
					break;
				case 2: // Top edge
					promise = motion([buttonInfo.y], [BUTTON_RADIUS + EDGE_MARGIN], motionMs, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) {
							firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
						}
					});
					break;
				case 3: // Bottom edge
					promise = motion([buttonInfo.y], [window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN)], motionMs, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) {
							firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
						}
					});
					break;
			}

			await promise;
			savePosition();
		};
	}

	function setDash(node: SVGSVGElement): void {
		let first = true;
		for (const LINE_ELEMENT of Array.from(node.children)) {
			const EL = LINE_ELEMENT as SVGLineElement;
			if (typeof EL.getTotalLength !== 'function') continue;
			const TOTAL_LENGTH = EL.getTotalLength().toString();
			EL.style.strokeDasharray = TOTAL_LENGTH;
			EL.style.strokeDashoffset = TOTAL_LENGTH;
			setTimeout(() => {
				EL.style.transition = first ? 'stroke-dashoffset 0.2s' : 'stroke-dashoffset 0.2s 0.2s';
				EL.style.strokeDashoffset = '0';
				first = false;
			}, 0);
		}
	}

	function reverse(): void {
		if (!svg) {
			return;
		}

		let first = true;
		for (const LINE_ELEMENT of Array.from(svg.children)) {
			const EL = LINE_ELEMENT as SVGLineElement;
			if (typeof EL.getTotalLength !== 'function') continue;
			EL.style.transition = first ? 'stroke-dashoffset 0.2s 0.2s' : 'stroke-dashoffset 0.2s';
			const TOTAL_LENGTH = EL.getTotalLength().toString();
			EL.style.strokeDasharray = TOTAL_LENGTH;
			EL.style.strokeDashoffset = TOTAL_LENGTH;
			first = false;
		}

		for (const CIRCLE of circles) {
			if (CIRCLE) {
				CIRCLE.style.display = 'none';
			}
		}
	}

	function keepAlive(_node: HTMLElement, { delay = 0, duration = 200, easing: easingFn = linear } = {}) {
		return { delay, duration, easing: easingFn, css: (_: number) => '' };
	}

	// Effects
	$effect(() => {
		if (!showRoutes) {
			reverse();
		}
	});

	// Lifecycle
	onMount(() => {
		if (!browser) {
			return;
		}

		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		motionMs = prefersReducedMotion ? 0 : MOTION_MS_DEFAULT;

		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		loadSavedPosition();

		window.addEventListener('resize', handleResize, { passive: true });
		window.addEventListener('keydown', onKeyDown);
	});

	onDestroy(() => {
		if (!browser) {
			return;
		}

		window.removeEventListener('resize', handleResize);
		window.removeEventListener('keydown', onKeyDown);
	});

	const centerEndpoint = $derived(endpoints[0]);
	/** Only Home (+ optional fixed Settings spoke) — show a quieter “empty” ring. */
	const isMinimalMenu = $derived(spokeEndpoints.length <= 1 && spokeEndpoints.every((s) => s.id === 'settings' || s.id === 'config'));
</script>

<!-- FloatingNav: Draggable button with radial menu, keyboard nav, reduced motion, ARIA -->

<SystemTooltip
	title="Open Navigation Menu"
	contentClass="z-[99999999]"
	positioning={{ placement: 'top' }}
	triggerClass="fixed z-99999999 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer touch-none items-center justify-center rounded-full bg-tertiary-500 active:scale-90 !pointer-events-auto"
	triggerStyle="{browser
		? (() => {
			const clampedX = Math.min(Math.max(buttonInfo.x, BUTTON_RADIUS + EDGE_MARGIN), window.innerWidth - BUTTON_RADIUS - EDGE_MARGIN);
			const clampedY = Math.min(buttonInfo.y, window.innerHeight - BUTTON_RADIUS);
			const yPct = (clampedY / window.innerHeight) * 100;
			if (isRightToLeft()) {
				const rightPct = ((window.innerWidth - clampedX) / window.innerWidth) * 100;
				return `top:${yPct}%; right:${rightPct}%;`;
			}
			const leftPct = (clampedX / window.innerWidth) * 100;
			return `top:${yPct}%; left:${leftPct}%;`;
		})()
		: ''}
	              width:{BUTTON_RADIUS * 2}px;
	              height:{BUTTON_RADIUS * 2}px"
>
	<div
		bind:this={firstCircle}
		aria-label="Open Navigation Menu"
		role="button"
		aria-expanded={showRoutes}
		tabindex="0"
		use:drag
		class="h-full w-full flex items-center justify-center"
		onkeydown={(event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggleMenuOpen();
			}
		}}
	>
		<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white"></iconify-icon>
	</div>
</SystemTooltip>

	{#if showRoutes}
			<div out:keepAlive|local class="fixed inset-s-0 top-0 z-9999999">
			<Button variant="ghost" onclick={closeMenu} class="fixed inset-s-0 top-0 z-9999999" aria-label="Close navigation overlay">
		<svg
			bind:this={svg}
			xmlns="http://www.w3.org/2000/svg"
			use:setDash
			aria-hidden="true"
			class="pointer-events-none fixed inset-s-0 top-0 h-full w-full [&&>line]:pointer-events-none [&&>line]:stroke-[#da1f1f] [&&>line]:stroke-[3px]"
		>
			<!-- FAB → center Home line always present -->
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each spokesWithPos as endpoint (endpoint.id)}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<!-- Empty / minimal ring: still draw the circle so the menu feels intentional -->
		<div
			transition:fade
			aria-hidden="true"
			class="absolute inset-s-1/2 top-1/4 z-9999998 -translate-x-1/2 -translate-y-1/2 animate-[showEndPoints_0.2s_0.2s_forwards] rounded-full border bg-tertiary-500/40"
			class:opacity-60={isMinimalMenu && spokeEndpoints.length === 0}
			style="top:{center.y}px;
			       left:{center.x}px;
			       width:{MENU_RADIUS * 2}px;
			       height:{MENU_RADIUS * 2}px"
		></div>

		<!-- Fixed center: Home (always) -->
		<SystemTooltip
			title={centerEndpoint?.tooltip || 'Home'}
			contentClass="z-[99999999]"
			positioning={{ placement: 'top' }}
			triggerClass="fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 animate-[showEndPoints_0.2s_0.2s_forwards] cursor-pointer items-center justify-center rounded-full border-2 bg-tertiary-500"
			triggerStyle="top:{center.y}px; left:{center.x}px"
		>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a
				bind:this={circles[0]}
				href={centerEndpoint?.path || '/'}
				target={centerEndpoint?.external ? '_blank' : undefined}
				rel={centerEndpoint?.external ? 'noopener noreferrer' : undefined}
				data-preload={centerEndpoint?.external ? undefined : 'hover'}
				onclick={handleNavigateHome}
				aria-label={centerEndpoint?.tooltip || 'Home'}
				class="h-full w-full flex items-center justify-center"
			>
				<iconify-icon width="32" style="color:white" icon={centerEndpoint?.icon || 'solar:home-bold'}></iconify-icon>
			</a>
		</SystemTooltip>

		{#each spokesWithPos as endpoint, index (endpoint.id)}
			<SystemTooltip
				title={endpoint.tooltip}
				contentClass="z-[99999999]"
				positioning={{ placement: 'top' }}
				triggerClass="fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full {endpoint.color ||
					'bg-tertiary-500'} animate-[showEndPoints_0.2s_0.4s_forwards] hover:scale-150 active:scale-100"
				triggerStyle="top:{endpoint.y}px; left:{endpoint.x}px"
			>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a
					bind:this={circles[index + 1]}
					href={endpoint.path}
					target={endpoint.external ? '_blank' : undefined}
					rel={endpoint.external ? 'noopener noreferrer' : undefined}
					data-preload={endpoint.external ? undefined : 'hover'}
					onclick={handleNavigateToEndpoint}
					aria-label={endpoint.tooltip}
					class="h-full w-full flex items-center justify-center"
				>
					<iconify-icon width="32" style="color:white" icon={endpoint.icon}></iconify-icon>
				</a>
			</SystemTooltip>
		{/each}
	</Button>
		</div>
	{/if}

<style lang="postcss">
	@keyframes showEndPoints {
		from {
			opacity: 0;
			visibility: hidden;
		}
		to {
			opacity: 1;
			visibility: visible;
		}
	}

	/* Make animation globally available */
	:global(.animate-\[showEndPoints_0\.2s_0\.2s_forwards\]),
	:global(.animate-\[showEndPoints_0\.2s_0\.4s_forwards\]) {
		animation-name: showEndPoints;
	}
</style>
