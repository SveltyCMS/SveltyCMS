<!--
@file src/components/system/FloatingNav.svelte
@component
**Floating Navigation with Draggable Button and Radial Menu**

Creates a draggable floating navigation button that expands into a radial menu
with quick access to main sections: Home, User, Collections, Config, etc.

@example
<FloatingNav />

@features
- Draggable floating action button
- Radial menu expansion with smooth animations
- SvelteKit navigation integration
- Position persistence via localStorage
- Role-based endpoint filtering
- Touch-optimized for mobile devices
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { motion } from '@src/utils/utils';
	import { onDestroy, onMount, tick } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	// Auth
	import type { User } from '@src/auth/types';

	// Stores
	import { mode } from '@stores/collectionStore.svelte';
	import { toggleUIElement } from '@stores/UIStore.svelte';
	// Skeleton UI - Import popup action and modal store
	import { getModalStore, popup } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// --- Tooltip State ---
	const navPopup = 'floatingNavTooltip'; // A unique ID for the popup target
	let activeTooltipText = ''; // This will hold the text for the currently hovered button

	// Config / UX constants
	const buttonRadius = 25; // home button size
	const EDGE_MARGIN = 12; // px gap from screen edges for the FAB
	let navigation_info: Record<string, any> = {};
	let showRoutes = false;
	let center = { x: 0, y: 0 };

	// Refs
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
	const circles: HTMLDivElement[] = [];
	let svg: SVGElement;
	let user: User = page.data.user;

	// Motion preferences
	let prefersReducedMotion = false;
	let MOTION_MS = 200;

	// Endpoint definition now includes a 'tooltip' property
	let endpoints: {
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
		tooltip: string;
		color?: string;
	}[] = [
		{
			tooltip: 'Home',
			url: { external: false, path: `/` },
			icon: 'solar:home-bold'
		},
		{
			tooltip: 'User Profile',
			url: { external: false, path: `/user` },
			icon: 'radix-icons:avatar',
			color: 'bg-orange-500'
		},
		{
			tooltip: 'Collection Builder',
			url: { external: false, path: `/config/collectionbuilder` },
			icon: 'fluent-mdl2:build-definition',
			color: 'bg-green-500'
		},
		{
			tooltip: 'Image Editor',
			url: { external: false, path: `/imageEditor` },
			icon: 'tdesign:image-edit'
		},
		{
			tooltip: 'GraphQL Explorer',
			url: { external: true, path: `/api/graphql` },
			icon: 'teenyicons:graphql-outline',
			color: 'bg-pink-500'
		},
		{
			tooltip: 'System Configuration',
			url: { external: false, path: `/config` },
			icon: 'mynaui:config',
			color: 'bg-surface-400'
		},
		{
			tooltip: 'Marketplace',
			url: { external: true, path: `https://www.sveltycms.com` },
			icon: 'icon-park-outline:shopping-bag',
			color: 'bg-primary-700'
		}
	].filter((endpoint) => {
		if (user?.role === 'admin') return true;
		else if (endpoint.url.path === '/collection') return false;
		else return true;
	});

	export let buttonInfo: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: buttonRadius };

	// Adjust button position on window resize
	async function handleResize() {
		const minX = buttonRadius + EDGE_MARGIN;
		const maxX = window.innerWidth - (buttonRadius + EDGE_MARGIN);
		const minY = buttonRadius + EDGE_MARGIN;
		const maxY = window.innerHeight - (buttonRadius + EDGE_MARGIN);
		buttonInfo.x = Math.min(Math.max(buttonInfo.x, minX), maxX);
		buttonInfo.y = Math.min(Math.max(buttonInfo.y, minY), maxY);
		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		if (firstLine && firstCircle) {
			firstLine.setAttribute('x1', firstCircle.offsetLeft.toString());
			firstLine.setAttribute('y1', firstCircle.offsetTop.toString());
			await tick();
			firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
		}
	}

	function getBasePath(pathname: string) {
		const params = Object.values(page.params);
		const replaced = params.reduce((acc, param) => {
			return acc.replace(param, '');
		}, pathname);
		return params.length > 0 ? replaced : pathname;
	}

	onMount(() => {
		try {
			navigation_info = JSON.parse(localStorage.getItem('navigation') || '{}');
		} catch {
			navigation_info = {};
		}
		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		MOTION_MS = prefersReducedMotion ? 0 : 200;
		const key = getBasePath(page.url.pathname);
		const saved = navigation_info[key];
		if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
			buttonInfo = { x: saved.x, y: saved.y, radius: buttonRadius };
		} else {
			buttonInfo = {
				x: window.innerWidth - (buttonRadius + EDGE_MARGIN),
				y: window.innerHeight - (buttonRadius + EDGE_MARGIN),
				radius: buttonRadius
			};
		}
		window.addEventListener('resize', handleResize, { passive: true });
		window.addEventListener('keydown', onKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
		window.removeEventListener('keydown', onKeyDown);
	});

	const MENU_RADIUS = 160;

	$: endpointsWithPos = endpoints.map((endpoint, index) => {
		const angle = ((Math.PI * 2) / endpoints.length) * (index + 1.25);
		const x = center.x + MENU_RADIUS * Math.cos(angle);
		const y = center.y + MENU_RADIUS * Math.sin(angle);
		return { ...endpoint, x, y, angle };
	});

	function closeMenu() {
		if (!showRoutes) return;
		showRoutes = false;
		try {
			navigator.vibrate?.(5);
		} catch {}
		setTimeout(() => firstCircle?.focus?.(), 0);
	}

	async function toggleMenuOpen() {
		if (!showRoutes) {
			center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
			await tick();
			showRoutes = true;
			try {
				navigator.vibrate?.(10);
			} catch {}
			await tick();
			circles[0]?.focus?.();
		} else {
			closeMenu();
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeMenu();
	}

	function drag(node: HTMLDivElement) {
		let moved = false;
		let dragging = false;
		let startX = 0;
		let startY = 0;
		const DRAG_THRESHOLD = 10;
		node.onpointerdown = (e) => {
			startX = e.clientX;
			startY = e.clientY;
			moved = false;
			dragging = false;
			node.setPointerCapture(e.pointerId);
			node.onpointermove = (moveEvent) => {
				const dx = moveEvent.clientX - startX;
				const dy = moveEvent.clientY - startY;
				const distance = Math.sqrt(dx * dx + dy * dy);
				if (!dragging && distance > DRAG_THRESHOLD) {
					dragging = true;
				}
				if (dragging) {
					moved = true;
					const offsetX = e.offsetX - node.offsetWidth / 2;
					const offsetY = e.offsetY - node.offsetHeight / 2;
					buttonInfo = {
						...buttonInfo,
						x: moveEvent.clientX - offsetX,
						y: moveEvent.clientY - offsetY
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
			const distance = [buttonInfo.x, window.innerWidth - buttonInfo.x, buttonInfo.y, window.innerHeight - buttonInfo.y];
			let promise: Promise<void> = Promise.resolve();
			switch (distance.indexOf(Math.min(...distance))) {
				case 0: {
					promise = motion([buttonInfo.x], [buttonRadius + EDGE_MARGIN], MOTION_MS, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				}
				case 1: {
					promise = motion([buttonInfo.x], [window.innerWidth - (buttonRadius + EDGE_MARGIN)], MOTION_MS, async (t) => {
						buttonInfo.x = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				}
				case 2: {
					promise = motion([buttonInfo.y], [buttonRadius + EDGE_MARGIN], MOTION_MS, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				}
				case 3: {
					promise = motion([buttonInfo.y], [window.innerHeight - (buttonRadius + EDGE_MARGIN)], MOTION_MS, async (t) => {
						buttonInfo.y = t[0];
						await tick();
						if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					});
					break;
				}
			}
			await tick();
			if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
			await promise;
			navigation_info = { ...navigation_info, ...{ [getBasePath(page.url.pathname)]: buttonInfo } };
			localStorage.setItem('navigation', JSON.stringify(navigation_info));
		};
	}

	function setDash(node: SVGElement) {
		let first = true;
		for (const lineElement of node.children) {
			const el = lineElement as SVGLineElement;
			const totalLength = el.getTotalLength().toString();
			el.style.strokeDasharray = totalLength;
			el.style.strokeDashoffset = totalLength;
			setTimeout(() => {
				el.style.transition = first ? 'stroke-dashoffset 0.2s ' : 'stroke-dashoffset 0.2s 0.2s';
				el.style.strokeDashoffset = '0';
				first = false;
			}, 0);
		}
	}

	function reverse() {
		if (!svg) return;
		let first = true;
		for (const lineElement of svg.children) {
			const el = lineElement as SVGLineElement;
			el.style.transition = first ? 'stroke-dashoffset 0.2s 0.2s' : 'stroke-dashoffset 0.2s ';
			const totalLength = el.getTotalLength().toString();
			el.style.strokeDasharray = totalLength;
			el.style.strokeDashoffset = totalLength;
			first = false;
		}
		for (const circle of circles) {
			circle.style.display = 'none';
		}
	}

	$: if (!showRoutes) reverse();
	function keepAlive(_node: HTMLElement, { delay = 0, duration = 200, easing: easing$1 = linear } = {}) {
		return { delay, duration, easing: easing$1, css: (_: number) => `` };
	}

	function isRightToLeft() {
		return document.documentElement.dir === 'rtl';
	}
</script>

<div class="card variant-filled-surface z-[99999999] p-2" data-popup={navPopup}>
	{activeTooltipText}
	<div class="variant-filled-surface arrow"></div>
</div>

<!-- Main navigation button -->
<div
	bind:this={firstCircle}
	use:popup={{ event: 'hover', target: navPopup, placement: 'top' }}
	on:mouseenter={() => (activeTooltipText = 'Open Navigation Menu')}
	on:mouseleave={() => (activeTooltipText = '')}
	aria-label="Open Navigation Menu"
	role="button"
	aria-expanded={showRoutes}
	tabindex="0"
	use:drag
	class="circle flex touch-none items-center justify-center bg-tertiary-500 [&>*]:pointer-events-none"
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;left:{(Math.min(
		isRightToLeft() ? buttonRadius : buttonInfo.x,
		window.innerWidth - buttonRadius
	) /
		window.innerWidth) *
		100}%;width:{buttonRadius * 2}px;height:{buttonRadius * 2}px"
	on:keydown={(event) => {
		if (event.key === 'Enter' || event.key === 'Space') {
			toggleMenuOpen();
		}
	}}
>
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white"></iconify-icon>
</div>

{#if showRoutes}
	<button out:keepAlive|local on:click|self={closeMenu} class="fixed left-0 top-0 z-[9999999]" aria-label="Close navigation overlay">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpointsWithPos.slice(1, endpointsWithPos.length) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<div
			transition:fade
			class="absolute left-1/2 top-1/4 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-tertiary-500/40"
			style="top:{center.y}px;left:{center.x}px;width:{MENU_RADIUS * 2}px;height:{MENU_RADIUS *
				2}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		></div>

		<div
			bind:this={circles[0]}
			use:popup={{ event: 'hover', target: navPopup, placement: 'top' }}
			on:mouseenter={() => (activeTooltipText = endpoints[0]?.tooltip)}
			on:mouseleave={() => (activeTooltipText = '')}
			role="button"
			aria-label={endpoints[0]?.tooltip || 'Home'}
			tabindex="0"
			on:click={() => {
				mode.set('view');
				modalStore.clear();
				toggleUIElement('leftSidebar', 'hidden');
				endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
				showRoutes = false;
			}}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					mode.set('view');
					modalStore.clear();
					toggleUIElement('leftSidebar', 'hidden');
					endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
					showRoutes = false;
				}
			}}
			class="circle flex items-center justify-center border-2 bg-gray-600"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		>
			<iconify-icon width="32" style="color:white" icon={endpoints[0]?.icon}></iconify-icon>
		</div>

		{#each endpointsWithPos.slice(1, endpointsWithPos.length) as endpoint, index}
			<div
				bind:this={circles[index + 1]}
				use:popup={{ event: 'hover', target: navPopup, placement: 'top' }}
				on:mouseenter={() => (activeTooltipText = endpoint.tooltip)}
				on:mouseleave={() => (activeTooltipText = '')}
				role="button"
				aria-label={endpoint.tooltip}
				tabindex="0"
				on:click={() => {
					if (endpoint?.url?.external) {
						window.open(endpoint?.url?.path || '/', '_blank');
					} else {
						goto(endpoint?.url?.path || '/');
					}
					showRoutes = false;
				}}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						if (endpoint?.url?.external) {
							window.open(endpoint?.url?.path || '/', '_blank');
						} else {
							goto(endpoint?.url?.path || '/');
						}
						showRoutes = false;
					}
				}}
				class="circle flex items-center justify-center {endpoint.color || 'bg-tertiary-500'}"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation: showEndPoints 0.2s 0.4s forwards"
			>
				<iconify-icon width="32" style="color:white" icon={endpoint.icon}></iconify-icon>
			</div>
		{/each}
	</button>
{/if}

<style lang="postcss">
	.circle {
		position: fixed;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		width: 50px;
		height: 50px;
		cursor: pointer;
		z-index: 99999999;
	}
	.circle:not(:first-of-type):hover {
		transform: translate(-50%, -50%) scale(1.5);
	}
	.circle:not(:first-of-type):active {
		transform: translate(-50%, -50%) scale(1) !important;
	}
	.circle:first-of-type:active {
		transform: translate(-50%, -50%) scale(0.9) !important;
	}

	svg {
		position: fixed;
		left: 0;
		top: 0;
		height: 100%;
		width: 100%;
		pointer-events: none;
	}

	line {
		stroke: #da1f1f;
		stroke-width: 3;
		pointer-events: none;
	}

	@keyframes -global-showEndPoints {
		from {
			visibility: hidden;
		}
		100% {
			opacity: 1;
			visibility: visible;
		}
	}
</style>
