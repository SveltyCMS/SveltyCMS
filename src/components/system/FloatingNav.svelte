<!-- 
@file src/components/system/FloatingNav.svelte 
@description Floating nav component for mobile
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { tick, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { motion } from '@utils/utils';
	import { fade } from 'svelte/transition';

	// Auth
	import type { User } from '@src/auth/types';

	// Stores
	import { page } from '$app/stores';
	import { mode } from '@stores/collectionStore';
	import { handleSidebarToggle } from '@stores/sidebarStore';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	const dispatch = createEventDispatcher();

	// Type Definitions
	interface Endpoint {
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
		color?: string;
		x?: number;
		y?: number;
		angle?: number;
	}

	interface ButtonInfo {
		x: number;
		y: number;
		radius: number;
	}

	// Initialize navigation_info safely
	let navigation_info: Record<string, ButtonInfo> = {};
	const storedNavigation = localStorage.getItem('navigation');
	if (storedNavigation) {
		navigation_info = JSON.parse(storedNavigation);
	}

	const buttonRadius: number = 25; // home button size
	let showRoutes: boolean = false;

	const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
	const circles: HTMLDivElement[] = [];
	let svg: SVGSVGElement;
	const user: User = $page.data.user;

	// Endpoint definition with URL and icon only
	let endpoints: Endpoint[] = [
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
			icon: 'fluent-mdl2:build-definition'
		},
		{
			// Image Editor
			url: { external: false, path: `/imageEditor` },
			icon: 'tdesign:image-edit',
			color: 'bg-error-500'
		},
		{
			// Graphql Yoga Explorer
			url: { external: true, path: `/api/graphql` },
			icon: 'teenyicons:graphql-outline',
			color: 'bg-pink-500'
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
		},
		{
			// GlobalSearch
			url: { external: false, path: 'globalsearch' },
			icon: 'material-symbols:search-rounded',
			color: 'bg-error-500'
		}
	].filter((endpoint) => {
		if (user?.role === 'admin') return true;
		else if (endpoint.url.path === '/collection') return false;
		else return true;
	});

	export let buttonInfo: ButtonInfo = {
		x: window.innerWidth - buttonRadius * 3, // right corner, adjusted inward by button's diameter
		y: window.innerHeight - buttonRadius * 3, // bottom corner, adjusted inward
		radius: buttonRadius
	};

	// Update buttonInfo from localStorage on mount
	onMount(() => {
		window.addEventListener('keydown', handleKeyPress);
		const storedInfo = localStorage.getItem('navigation');
		if (storedInfo) {
			const parsedInfo: Record<string, ButtonInfo> = JSON.parse(storedInfo);
			const currentPath = getBasePath($page.url.pathname);
			if (parsedInfo[currentPath]) {
				buttonInfo = parsedInfo[currentPath];
			}
		}
	});

	// Debounced resize handler
	function debounce(fn: () => void, delay: number) {
		let timer: ReturnType<typeof setTimeout>;
		return () => {
			clearTimeout(timer);
			timer = setTimeout(fn, delay);
		};
	}

	const handleResize = debounce(() => {
		buttonInfo = { ...buttonInfo, x: window.innerWidth - buttonRadius * 3, y: window.innerHeight - buttonRadius * 3 };
		if (firstLine && firstCircle) {
			firstLine.setAttribute('x1', firstCircle.offsetLeft.toString());
			firstLine.setAttribute('y1', firstCircle.offsetTop.toString());
		}
		tick().then(() => {
			if (firstLine) {
				firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
			}
		});
	}, 200);

	window.addEventListener('resize', handleResize);

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyPress);
		window.removeEventListener('resize', handleResize);
	});

	function getBasePath(pathname: string): string {
		const params = Object.values($page.params);
		const replaced = params.reduce((acc, param) => acc.replace(param, ''), pathname);
		return params.length > 0 ? replaced : pathname;
	}

	// Function to calculate endpoint coordinates and angles
	function calculateEndpoint(index: number, totalEndpoints: number, radius: number): { x: number; y: number; angle: number } {
		const angle = ((Math.PI * 2) / totalEndpoints) * (index + 1.25); // Adjust angle for centering
		const x = center.x + radius * Math.cos(angle);
		const y = center.y + radius * Math.sin(angle);
		return { x, y, angle };
	}

	// Calculate endpoint positions and angles based on their index
	$: endpointsWithPositions = endpoints.map((endpoint, index) => ({
		...endpoint,
		...calculateEndpoint(index, endpoints.length, 140) // Adjust radius as needed
	}));

	// Show the routes when the component is visible
	function drag(node: HTMLDivElement) {
		let moved = false;
		let timeout: ReturnType<typeof setTimeout>;
		node.onpointerdown = (e: PointerEvent) => {
			timeout = setTimeout(() => {
				const x = e.offsetX - node.offsetWidth / 2;
				const y = e.offsetY - node.offsetHeight / 2;
				node.setPointerCapture(e.pointerId);
				node.onpointermove = (e: PointerEvent) => {
					moved = true;
					buttonInfo = { ...buttonInfo, x: e.clientX - x, y: e.clientY - y };
					if (firstLine) {
						firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
					}
				};
			}, 60);
		};
		node.onpointerup = async (e: PointerEvent) => {
			if (!moved) {
				showRoutes = !showRoutes;
			}

			if (timeout) clearTimeout(timeout);
			moved = false;
			node.onpointermove = null;
			node.releasePointerCapture(e.pointerId);

			const distance = [
				buttonInfo.x, // left
				window.innerWidth - buttonInfo.x, // right
				buttonInfo.y, // top
				window.innerHeight - buttonInfo.y // bottom
			];

			const minDistanceIndex = distance.indexOf(Math.min(...distance));
			let targetX = buttonInfo.x;
			let targetY = buttonInfo.y;

			switch (minDistanceIndex) {
				case 0:
					targetX = buttonRadius;
					break;
				case 1:
					targetX = window.innerWidth - buttonRadius;
					break;
				case 2:
					targetY = buttonRadius;
					break;
				case 3:
					targetY = window.innerHeight - buttonRadius;
					break;
			}

			await motion([buttonInfo.x, buttonInfo.y], [targetX, targetY], 200, (t: number[]) => {
				buttonInfo = { ...buttonInfo, x: t[0], y: t[1] };
				if (firstLine) {
					firstLine.style.strokeDasharray = firstLine.getTotalLength().toString();
				}
			});

			await tick();
			navigation_info = { ...navigation_info, [getBasePath($page.url.pathname)]: buttonInfo };
			localStorage.setItem('navigation', JSON.stringify(navigation_info));
		};
	}

	// Event handler for keydown on the main navigation button
	function handleMainKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			showRoutes = !showRoutes;
		}
	}

	// Event handler for keydown on endpoint buttons
	function handleEndpointKeydown(event: KeyboardEvent, endpoint: Endpoint): void {
		if (event.key === 'Enter' || event.key === ' ') {
			handleEndpointClick(endpoint);
		}
	}

	// Function to handle endpoint click
	function handleEndpointClick(endpoint: Endpoint): void {
		if (endpoint.url.path === 'globalsearch') {
			dispatch('globalsearch');
		} else {
			mode.set('view');
			modalStore.clear();
			handleSidebarToggle();
			if (endpoint.url.external) {
				location.href = endpoint.url.path || '/';
			} else {
				goto(endpoint.url.path || '/');
			}
		}
		showRoutes = false;
	}

	// Set the dash of the line
	function setDash(node: SVGSVGElement) {
		let first = true;
		for (const lineElement of node.children) {
			const el = lineElement as SVGLineElement;
			el.style.strokeDashoffset = el.style.strokeDasharray = el.getTotalLength().toString();
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
			el.style.strokeDashoffset = el.style.strokeDasharray = el.getTotalLength().toString();
			first = false;
		}
		for (const circle of circles) {
			circle.style.display = 'none';
		}
	}

	// Animate the dash
	$: if (!showRoutes) reverse();

	function isRightToLeft(): boolean {
		return document.documentElement.dir === 'rtl';
	}

	// Function to handle key presses
	function handleKeyPress(event: KeyboardEvent) {
		if (event.altKey && event.key === 's') {
			dispatch('globalsearch');
		}
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
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;
           left:{(Math.min(
		isRightToLeft() ? buttonRadius : buttonInfo.x, // Change left position based on RTL
		window.innerWidth - buttonRadius
	) /
		window.innerWidth) *
		100}%;
           width:{buttonInfo.radius * 2}px;
           height:{buttonInfo.radius * 2}px"
	tabindex="0"
	on:keydown={handleMainKeyDown}
>
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white" />
</div>

<!-- Show the routes when the component is visible -->
{#if showRoutes}
	<button on:click={() => (showRoutes = false)} class="fixed left-0 top-0 z-[9999999]">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpointsWithPositions.slice(1) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<!-- Home button -->
		<div
			transition:fade
			class="absolute left-1/2 top-1/4 -z-10 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-tertiary-500/40"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		></div>

		<!-- Other endpoint buttons -->
		<div
			bind:this={circles[0]}
			role="button"
			aria-label="Home"
			tabindex="0"
			on:click={() => handleEndpointClick(endpointsWithPositions[0])}
			on:keydown={(event) => handleEndpointKeydown(event, endpointsWithPositions[0])}
			class="circle flex items-center justify-center border-2 bg-gray-600"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation:
			showEndPoints 0.2s 0.2s forwards"
		>
			<iconify-icon width="32" style="color:white" icon="solar:home-bold" />
		</div>

		{#each endpointsWithPositions.slice(1) as endpoint, index}
			<div
				bind:this={circles[index + 1]}
				role="button"
				aria-label={endpoint.icon}
				tabindex="0"
				on:click={() => handleEndpointClick(endpoint)}
				on:keydown={(event) => handleEndpointKeydown(event, endpoint)}
				class="circle flex items-center justify-center {endpoint.color || 'bg-tertiary-500'}"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation:
				showEndPoints 0.2s 0.4s forwards"
				transition:fade={{ delay: 200, duration: 200 }}
			>
				<!-- Icon for the button -->
				<iconify-icon width="32" style="color:white" icon={endpoint.icon} />
			</div>
		{/each}
	</button>
{/if}

<style lang="postcss">
	div {
		width: 100vw;
		height: 100vh;
	}

	.circle {
		position: fixed;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		width: 50px;
		height: 50px;
		cursor: pointer;
		z-index: 99999999;
		transition: transform 0.2s;
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

	@keyframes showEndPoints {
		from {
			visibility: hidden;
		}
		to {
			opacity: 1;
			visibility: visible;
		}
	}

	button {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
	}
</style>
