<!--
@file src/components/system/FloatingNav.svelte
@component
**Floating Navigation with Draggable Button and Radial Menu**

Creates a draggable floating navigation button that expands into a radial menu
with quick access to main sections: Home, User, Collections, Config, etc.

@example
<FloatingNav />

### Features
- Draggable floating button
- Radial menu for quick access to main sections
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { page } from '$app/state';
	import { motion } from '@src/utils/utils';
	import { onDestroy, onMount, tick } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';

	// Auth
	import type { User } from '@src/databases/auth/types';

	// Stores
	import { setMode } from '@stores/collectionStore.svelte';
	import { toggleUIElement } from '@stores/UIStore.svelte';

	// Skeleton UI
	import { modalState } from '@utils/modalState.svelte';

	// Constants
	const BUTTON_RADIUS = 25;
	const EDGE_MARGIN = 12;
	const MENU_RADIUS = 160;
	const DRAG_THRESHOLD = 10;
	const MOTION_MS_DEFAULT = 200;
	const VIBRATE_OPEN_MS = 10;
	const VIBRATE_CLOSE_MS = 5;

	// Endpoint type
	type Endpoint = {
		tooltip: string;
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
		color?: string;
	};

	// Get user from page data
	const user = $derived(page.data.user as User | undefined);

	// Endpoint definitions
	const ALL_ENDPOINTS: Endpoint[] = [
		{
			tooltip: 'Home',
			url: { external: false, path: '/' },
			icon: 'solar:home-bold'
		},
		{
			tooltip: 'Dashboard',
			url: { external: false, path: '/dashboard' },
			icon: 'mdi:view-dashboard',
			color: 'bg-blue-500'
		},
		{
			tooltip: 'User Profile',
			url: { external: false, path: '/user' },
			icon: 'radix-icons:avatar',
			color: 'bg-orange-500'
		},
		{
			tooltip: 'Collection Builder',
			url: { external: false, path: '/config/collectionbuilder' },
			icon: 'fluent-mdl2:build-definition',
			color: 'bg-green-500'
		},

		{
			tooltip: 'GraphQL Explorer',
			url: { external: true, path: '/api/graphql' },
			icon: 'teenyicons:graphql-outline',
			color: 'bg-pink-500'
		},
		{
			tooltip: 'System Configuration',
			url: { external: false, path: '/config' },
			icon: 'mynaui:config',
			color: 'bg-surface-400'
		},
		{
			tooltip: 'Access Management',
			url: { external: false, path: '/config/accessManagement' },
			icon: 'mdi:shield-account',
			color: 'bg-purple-500'
		},
		{
			tooltip: 'Marketplace',
			url: { external: true, path: 'https://www.sveltycms.com' },
			icon: 'icon-park-outline:shopping-bag',
			color: 'bg-primary-700'
		}
	];

	// Filter endpoints based on user role
	const endpoints = $derived(
		ALL_ENDPOINTS.filter((endpoint) => {
			if (user?.role === 'admin') return true;
			if (endpoint.url.path === '/collection') return false;
			return true;
		})
	);

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

	// Calculate endpoint positions
	const endpointsWithPos = $derived(
		endpoints.map((endpoint, index) => {
			const ANGLE = ((Math.PI * 2) / endpoints.length) * (index + 1.25);
			const X = center.x + MENU_RADIUS * Math.cos(ANGLE);
			const Y = center.y + MENU_RADIUS * Math.sin(ANGLE);
			return { ...endpoint, x: X, y: Y, angle: ANGLE };
		})
	);

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
		if (!browser) return;

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
		if (!browser) return;

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
		if (!browser) return;

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
		if (!showRoutes) return;
		showRoutes = false;
		vibrate(VIBRATE_CLOSE_MS);
		setTimeout(() => firstCircle?.focus?.(), 0);
	}

	async function toggleMenuOpen(): Promise<void> {
		if (!showRoutes) {
			center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
			await tick();
			showRoutes = true;
			vibrate(VIBRATE_OPEN_MS);
			await tick();
			circles[0]?.focus?.();
		} else {
			closeMenu();
		}
	}

	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape') closeMenu();
	}

	function handleNavigateToEndpoint(): void {
		setMode('view');
		showRoutes = false;
		// Navigation is handled by <a> tag href attribute
	}

	function handleNavigateHome(): void {
		setMode('view');
		modalState.clear();
		toggleUIElement('leftSidebar', 'hidden');
		showRoutes = false;
		// Navigation will be handled by <a> tag
	}

	// Drag functionality
	function drag(node: HTMLDivElement) {
		let moved = false;
		let dragging = false;
		let startX = 0;
		let startY = 0;

		node.onpointerdown = (e) => {
			startX = e.clientX;
			startY = e.clientY;
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
					const OFFSET_X = e.offsetX - node.offsetWidth / 2;
					const OFFSET_Y = e.offsetY - node.offsetHeight / 2;

					buttonInfo = {
						...buttonInfo,
						x: moveEvent.clientX - OFFSET_X,
						y: moveEvent.clientY - OFFSET_Y
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
			node.releasePointerCapture(e.pointerId);

			if (!moved) return;

			// Snap to nearest edge
			const DISTANCES = [buttonInfo.x, window.innerWidth - buttonInfo.x, buttonInfo.y, window.innerHeight - buttonInfo.y];

			const NEAREST_EDGE_INDEX = DISTANCES.indexOf(Math.min(...DISTANCES));
			let promise: Promise<void> = Promise.resolve();

			switch (NEAREST_EDGE_INDEX) {
				case 0: // Left edge
					promise = motion([buttonInfo.x], [BUTTON_RADIUS + EDGE_MARGIN], motionMs, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				case 1: // Right edge
					promise = motion([buttonInfo.x], [window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN)], motionMs, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				case 2: // Top edge
					promise = motion([buttonInfo.y], [BUTTON_RADIUS + EDGE_MARGIN], motionMs, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				case 3: // Bottom edge
					promise = motion([buttonInfo.y], [window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN)], motionMs, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
			}

			await promise;
			savePosition();
		};
	}

	function setDash(node: SVGSVGElement): void {
		let first = true;
		for (const LINE_ELEMENT of node.children as HTMLCollectionOf<SVGLineElement>) {
			const EL = LINE_ELEMENT as SVGLineElement;
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
		if (!svg) return;

		let first = true;
		for (const LINE_ELEMENT of svg.children as HTMLCollectionOf<SVGLineElement>) {
			const EL = LINE_ELEMENT as SVGLineElement;
			EL.style.transition = first ? 'stroke-dashoffset 0.2s 0.2s' : 'stroke-dashoffset 0.2s';
			const TOTAL_LENGTH = EL.getTotalLength().toString();
			EL.style.strokeDasharray = TOTAL_LENGTH;
			EL.style.strokeDashoffset = TOTAL_LENGTH;
			first = false;
		}

		for (const CIRCLE of circles as HTMLAnchorElement[]) {
			if (CIRCLE) CIRCLE.style.display = 'none';
		}
	}

	function keepAlive(_node: HTMLElement, { delay = 0, duration = 200, easing: easingFn = linear } = {}) {
		return { delay, duration, easing: easingFn, css: (_: number) => '' };
	}

	// Effects
	$effect(() => {
		if (!showRoutes) reverse();
	});

	// Lifecycle
	onMount(() => {
		if (!browser) return;

		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		motionMs = prefersReducedMotion ? 0 : MOTION_MS_DEFAULT;

		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		loadSavedPosition();

		window.addEventListener('resize', handleResize, { passive: true });
		window.addEventListener('keydown', onKeyDown);
	});

	onDestroy(() => {
		if (!browser) return;

		window.removeEventListener('resize', handleResize);
		window.removeEventListener('keydown', onKeyDown);
	});
</script>

<!-- Main navigation button -->
<div
	bind:this={firstCircle}
	title="Open Navigation Menu"
	aria-label="Open Navigation Menu"
	role="button"
	aria-expanded={showRoutes}
	tabindex="0"
	use:drag
	class="fixed z-99999999 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer touch-none items-center justify-center rounded-full bg-tertiary-500 active:scale-90 [&&>*]:pointer-events-none"
	style="top:{(Math.min(buttonInfo.y, browser ? window.innerHeight - BUTTON_RADIUS : 0) / (browser ? window.innerHeight : 1)) * 100}%;
	       left:{(Math.min(isRightToLeft() ? BUTTON_RADIUS : buttonInfo.x, browser ? window.innerWidth - BUTTON_RADIUS : 0) /
		(browser ? window.innerWidth : 1)) *
		100}%;
	       width:{BUTTON_RADIUS * 2}px;
	       height:{BUTTON_RADIUS * 2}px"
	onkeydown={(event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleMenuOpen();
		}
	}}
>
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white"></iconify-icon>
</div>

{#if showRoutes}
	<button out:keepAlive|local onclick={closeMenu} class="fixed left-0 top-0 z-99999999" aria-label="Close navigation overlay">
		<svg
			bind:this={svg}
			xmlns="http://www.w3.org/2000/svg"
			use:setDash
			class="pointer-events-none fixed left-0 top-0 h-full w-full [&&>line]:pointer-events-none [&&>line]:stroke-[#da1f1f] [&&>line]:stroke-[3px]"
		>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpointsWithPos.slice(1) as endpoint (endpoint.tooltip)}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<div
			transition:fade
			class="absolute left-1/2 top-1/4 z-99999998 -translate-x-1/2 -translate-y-1/2 animate-[showEndPoints_0.2s_0.2s_forwards] rounded-full border bg-tertiary-500/40"
			style="top:{center.y}px;
			       left:{center.x}px;
			       width:{MENU_RADIUS * 2}px;
			       height:{MENU_RADIUS * 2}px"
		></div>

		<a
			bind:this={circles[0]}
			href={endpoints[0]?.url?.path || '/'}
			target={endpoints[0]?.url?.external ? '_blank' : undefined}
			rel={endpoints[0]?.url?.external ? 'noopener noreferrer' : undefined}
			data-sveltekit-preload-data={endpoints[0]?.url?.external ? undefined : 'hover'}
			title={endpoints[0]?.tooltip || 'Home'}
			onclick={handleNavigateHome}
			aria-label={endpoints[0]?.tooltip || 'Home'}
			class="fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 animate-[showEndPoints_0.2s_0.2s_forwards] cursor-pointer items-center justify-center rounded-full border-2 bg-tertiary-500"
			style="top:{center.y}px;
			       left:{center.x}px"
		>
			<iconify-icon width="32" style="color:white" icon={endpoints[0]?.icon || 'solar:home-bold'}></iconify-icon>
		</a>

		{#each endpointsWithPos.slice(1) as endpoint, index (endpoint.tooltip)}
			<a
				bind:this={circles[index + 1]}
				href={endpoint.url.path}
				target={endpoint.url.external ? '_blank' : undefined}
				rel={endpoint.url.external ? 'noopener noreferrer' : undefined}
				data-sveltekit-preload-data={endpoint.url.external ? undefined : 'hover'}
				title={endpoint.tooltip}
				onclick={handleNavigateToEndpoint}
				aria-label={endpoint.tooltip}
				class="fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full {endpoint.color ||
					'bg-tertiary-500'} animate-[showEndPoints_0.2s_0.4s_forwards] hover:scale-150 active:scale-100"
				style="top:{endpoint.y}px;
			       left:{endpoint.x}px"
			>
				<iconify-icon width="32" style="color:white" icon={endpoint.icon}></iconify-icon>
			</a>
		{/each}
	</button>
{/if}

<style>
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
