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
	import { motion } from '@src/utils/utils';

	import { fade } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { tick, onMount, onDestroy } from 'svelte';

	// Auth
	import type { User } from '@src/auth/types';

	// Stores
	import { page } from '$app/stores';
	import { mode } from '@stores/collectionStore.svelte';
	import { toggleUIElement } from '@stores/UIStore.svelte';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Config / UX constants
	const buttonRadius = 25; // home button size
	const EDGE_MARGIN = 12; // px gap from screen edges for the FAB
	let navigation_info: Record<string, any> = {};
	let showRoutes = false;
	// radial menu center (set on mount and when opening)
	let center = { x: 0, y: 0 };

	// Refs
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
	const circles: HTMLDivElement[] = [];
	let svg: SVGElement;
	let user: User = $page.data.user;

	// Motion preferences
	let prefersReducedMotion = false;
	let MOTION_MS = 200;

	// Endpoint definition with URL and icon only
	let endpoints: {
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
		color?: string;
	}[] = [
		{
			// Home
			url: { external: false, path: `/` },
			icon: 'solar:home-bold'
		},
		{
			// User
			url: { external: false, path: `/user` },
			icon: 'radix-icons:avatar',
			color: 'bg-orange-500'
		},
		{
			// Collection builder
			url: { external: false, path: `/config/collectionbuilder` },
			icon: 'fluent-mdl2:build-definition',
			color: 'bg-green-500'
		},
		{
			// Image Editor
			url: { external: false, path: `/imageEditor` },
			icon: 'tdesign:image-edit'
		},
		{
			// Graphql Yoga Explorer
			url: { external: true, path: `/api/graphql` },
			icon: 'teenyicons:graphql-outline',
			color: 'bg-pink-500'
		},
		{
			// System Configuration
			url: { external: false, path: `/config` },
			icon: 'mynaui:config',
			color: 'bg-surface-400'
		},
		{
			// Marketplace
			url: { external: true, path: `https://www.sveltycms.com` },
			icon: 'icon-park-outline:shopping-bag',
			color: 'bg-primary-700'
		},
		{
			// System Configuration
			url: { external: false, path: `/config` },
			icon: 'mynaui:config',
			color: 'bg-surface-400'
		}
		//{

		// 	// GlobalSearch
		// 	url: { external: false, path: ``}, //this needs to change to alt+s
		// 	icon: 'material-symbols:search-rounded',
		// 	color: 'bg-error-500'
		// }
	].filter((endpoint) => {
		if (user?.role === 'admin') return true;
		else if (endpoint.url.path === '/collection') return false;
		else return true;
	});

	export let buttonInfo: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: buttonRadius };

	// Adjust button position on window resize (mounted only)
	async function handleResize() {
		// keep button inside the viewport on resize
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
		const params = Object.values($page.params);
		const replaced = params.reduce((acc, param) => {
			acc = acc.replace(param, '');
			return acc;
		}, pathname);
		return params.length > 0 ? replaced : pathname;
	}

	// Button position is exported with a default; refined on mount

	onMount(() => {
		// read persisted navigation positions
		try {
			navigation_info = JSON.parse(localStorage.getItem('navigation') || '{}');
		} catch {
			navigation_info = {};
		}

		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

		// motion preference
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		MOTION_MS = prefersReducedMotion ? 0 : 200;

		// restore position for this page if available
		const key = getBasePath($page.url.pathname);
		const saved = navigation_info[key];
		if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
			buttonInfo = { x: saved.x, y: saved.y, radius: buttonRadius };
			center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		} else {
			buttonInfo = {
				x: window.innerWidth - (buttonRadius + EDGE_MARGIN),
				y: window.innerHeight - (buttonRadius + EDGE_MARGIN),
				radius: buttonRadius
			};
			center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		}

		window.addEventListener('resize', handleResize, { passive: true });
		window.addEventListener('keydown', onKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
		window.removeEventListener('keydown', onKeyDown);
	});

	// Derived radius roughly matches the visual ring (~340px diameter => 170px radius)
	const MENU_RADIUS = 160;

	// Calculate endpoint positions and angles based on their index
	$: endpointsWithPos = endpoints.map((endpoint, index) => {
		const angle = ((Math.PI * 2) / endpoints.length) * (index + 1.25);
		const x = center.x + MENU_RADIUS * Math.cos(angle);
		const y = center.y + MENU_RADIUS * Math.sin(angle);
		return { ...endpoint, x, y, angle };
	});

	// Show the routes when the component is visible
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
		let timeout: ReturnType<typeof setTimeout>;
		let raf = 0;
		let nextX = 0,
			nextY = 0;
		node.onpointerdown = (e) => {
			timeout = setTimeout(() => {
				const x = e.offsetX - node.offsetWidth / 2;
				const y = e.offsetY - node.offsetHeight / 2;
				buttonInfo = { ...buttonInfo, x: e.clientX - x, y: e.clientY - y };
				node.setPointerCapture(e.pointerId);
				node.onpointermove = (e) => {
					moved = true;
					nextX = e.clientX - x;
					nextY = e.clientY - y;
					if (!raf) {
						raf = requestAnimationFrame(() => {
							buttonInfo = { ...buttonInfo, x: nextX, y: nextY };
							if (firstLine) firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
							raf = 0;
						});
					}
				};
			}, 60);
		};
		node.onpointerup = async (e) => {
			if (!moved) await toggleMenuOpen();

			timeout && clearTimeout(timeout);
			moved = false;
			node.onpointermove = null;
			node.releasePointerCapture(e.pointerId);
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}

			const distance = [
				buttonInfo.x, //left
				window.innerWidth - buttonInfo.x, //right
				buttonInfo.y, //top
				window.innerHeight - buttonInfo.y //bottom
			];

			let promise: Promise<void>;

			switch (distance.indexOf(Math.min(...distance))) {
				case 0:
					{
						promise = motion([buttonInfo.x], [buttonRadius + EDGE_MARGIN], MOTION_MS, async (t) => {
							buttonInfo.x = t[0];
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 1:
					{
						promise = motion([buttonInfo.x], [window.innerWidth - (buttonRadius + EDGE_MARGIN)], MOTION_MS, async (t) => {
							buttonInfo.x = t[0];
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 2:
					{
						promise = motion([buttonInfo.y], [buttonRadius + EDGE_MARGIN], MOTION_MS, async (t) => {
							buttonInfo.y = t[0];
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 3:
					{
						promise = motion([buttonInfo.y], [window.innerHeight - (buttonRadius + EDGE_MARGIN)], MOTION_MS, async (t) => {
							buttonInfo.y = t[0];
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
			}

			await tick();
			firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());

			await promise;
			navigation_info = { ...navigation_info, ...{ [getBasePath($page.url.pathname)]: buttonInfo } };
			localStorage.setItem('navigation', JSON.stringify(navigation_info));
		};
	}

	// Set the dash of the line
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

	// Reverse the dash
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

	// Animate the dash
	$: if (!showRoutes) reverse();
	function keepAlive(node, { delay = 0, duration = 200, easing: easing$1 = linear } = {}) {
		return {
			delay,
			duration,
			easing: easing$1,
			css: (t) => ``
		};
	}

	function isRightToLeft() {
		return document.documentElement.dir === 'rtl';
	}
</script>

<!-- Start Nav Button-->
<div
	bind:this={firstCircle}
	aria-label="Open navigation"
	role="button"
	aria-expanded={showRoutes}
	use:drag
	class="circle flex touch-none items-center justify-center bg-tertiary-500"
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;left:{(Math.min(
		isRightToLeft() ? buttonRadius : buttonInfo.x, // Change left position based on RTL
		window.innerWidth - buttonRadius
	) /
		window.innerWidth) *
		100}%;width:{buttonRadius * 2}px;height:{buttonRadius * 2}px"
>
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white"></iconify-icon>
</div>

<!-- Show the routes when the component is visible -->
{#if showRoutes}
	<button out:keepAlive|local on:click|self={closeMenu} class=" fixed left-0 top-0 z-[9999999]" aria-label="Close navigation overlay">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpointsWithPos.slice(1, endpointsWithPos.length) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<!-- Home button -->
		<div
			transition:fade
			class="absolute left-1/2 top-1/4 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-tertiary-500/40"
			style="top:{center.y}px;left:{center.x}px;width:{MENU_RADIUS * 2}px;height:{MENU_RADIUS *
				2}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		></div>

		<!-- Other endpoint buttons -->
		<div
			bind:this={circles[0]}
			role="button"
			aria-label="Home"
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
					// Trigger the same action as on:click
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
			<iconify-icon width="32" style="color:white" icon="solar:home-bold"></iconify-icon>
		</div>

		{#each endpointsWithPos.slice(1, endpointsWithPos.length) as endpoint, index}
			<div
				bind:this={circles[index + 1]}
				typeof="button"
				role={endpoint.icon}
				aria-label={endpoint.icon}
				on:click={() => {
					if (endpoint?.url?.external) {
						window.open(endpoint?.url?.path || '/', '_blank');
					} else {
						goto(endpoint?.url?.path || '/');
					}
					showRoutes = false;
				}}
				class="circle flex items-center justify-center {endpoint.color || 'bg-tertiary-500'}"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation: showEndPoints 0.2s 0.4s forwards"
			>
				<!-- Icon for the button -->
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
