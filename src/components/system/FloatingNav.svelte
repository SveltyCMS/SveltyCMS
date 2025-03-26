<!-- 
@file: src/components/system/FloatingNav.svelte 
@component#
**Floating nav component for mobile view**

```tsx
<FloatingNav />
```

Features:
- Floating nav for mobile view	
- Keyboard navigation support
- Accessibility features
-->

<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { motion } from '@utils/utils';
	import { fade, scale } from 'svelte/transition';
	import { elasticOut } from 'svelte/easing';

	// Auth
	import type { User } from '@src/auth/types';

	// Stores
	import { page } from '$app/state';
	import { mode } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle } from '@src/stores/sidebarStore.svelte';
	import { isSearchVisible, triggerActionStore } from '@utils/globalSearchIndex';

	// Type Definitions
	interface Endpoint {
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
		label: string;
		color?: string;
		x?: number;
		y?: number;
		angle?: number;
		action?: () => void;
		ariaLabel?: string;
	}

	interface ButtonInfo {
		x: number;
		y: number;
		radius: number;
	}

	// Initialize navigation_info safely
	let navigation_info = $state<Record<string, ButtonInfo>>(
		(() => {
			const storedNavigation = localStorage.getItem('navigation');
			return storedNavigation ? JSON.parse(storedNavigation) : {};
		})()
	);

	const buttonRadius = 25; // home button size
	let showRoutes = $state(false);

	const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
	let firstLine = $state<SVGLineElement | undefined>(undefined);
	let firstCircle = $state<HTMLDivElement | undefined>(undefined);
	let circles = $state<HTMLDivElement[]>([]);
	let svg = $state<SVGSVGElement | undefined>(undefined);
	const user: User = page.data.user;

	// Endpoint definition with URL and icon only
	let endpoints = $state<Endpoint[]>(
		[
			{
				// Home
				url: { external: false, path: `/` },
				icon: 'solar:home-bold',
				label: 'Navigate to Home',
				ariaLabel: 'Navigate to home page'
			},
			{
				// User
				url: { external: false, path: `/user` },
				icon: 'radix-icons:avatar',
				label: 'User Profile Settings',
				color: 'bg-orange-500',
				ariaLabel: 'Open user profile settings'
			},
			{
				// Collection builder
				url: { external: false, path: `/config/collectionbuilder` },
				icon: 'fluent-mdl2:build-definition',
				label: 'Collection Builder',
				ariaLabel: 'Open collection builder'
			},
			{
				// Image Editor
				url: { external: false, path: `/imageEditor` },
				icon: 'tdesign:image-edit',
				label: 'Image Editor',
				color: 'bg-error-500',
				ariaLabel: 'Open image editor'
			},
			{
				// Graphql Yoga Explorer
				url: { external: true, path: `/api/graphql` },
				icon: 'teenyicons:graphql-outline',
				label: 'GraphQL Explorer',
				color: 'bg-pink-500',
				ariaLabel: 'Open GraphQL explorer'
			},
			{
				// Marketplace
				url: { external: true, path: `https://www.sveltycms.com` },
				icon: 'icon-park-outline:shopping-bag',
				label: 'Visit Marketplace',
				color: 'bg-primary-700',
				ariaLabel: 'Visit SveltyCMS marketplace'
			},
			{
				// System Configuration
				url: { external: false, path: `/config` },
				icon: 'mynaui:config',
				label: 'System Configuration',
				color: 'bg-surface-400',
				ariaLabel: 'Open system configuration'
			},
			{
				// GlobalSearch
				url: { external: false, path: '' },
				icon: 'material-symbols:search-rounded',
				label: 'Global Search',
				color: 'bg-error-500',
				ariaLabel: 'Open global search (Alt + S)',
				action: () => {
					isSearchVisible.update((v) => !v);
					triggerActionStore.set([]);
				}
			}
		].filter((endpoint) => {
			if (user?.role === 'admin') return true;
			else if (endpoint.url.path === '/collection') return false;
			else return true;
		})
	);

	interface Props {
		buttonInfo?: ButtonInfo;
	}

	let {
		buttonInfo = $bindable({
			x: window.innerWidth - buttonRadius * 3,
			y: window.innerHeight - buttonRadius * 3,
			radius: buttonRadius
		})
	}: Props = $props();

	// Function to calculate endpoint coordinates and angles
	function calculateEndpoint(index: number, totalEndpoints: number, radius: number): { x: number; y: number; angle: number } {
		const angle = ((Math.PI * 2) / totalEndpoints) * (index + 1.25); // Adjust angle for centering
		const x = center.x + radius * Math.cos(angle);
		const y = center.y + radius * Math.sin(angle);
		return { x, y, angle };
	}

	// Calculate endpoint positions and angles based on their index
	let endpointsWithPositions = $derived(
		endpoints.map((endpoint, index) => ({
			...endpoint,
			...calculateEndpoint(index, endpoints.length, 140) // Adjust radius as needed
		}))
	);

	// Update line animations when showRoutes changes
	$effect(() => {
		if (!showRoutes && svg) {
			let first = true;
			for (const lineElement of svg.children) {
				const el = lineElement as SVGLineElement;
				el.style.transition = first ? 'stroke-dashoffset 0.2s 0.2s' : 'stroke-dashoffset 0.2s';
				el.style.strokeDashoffset = el.style.strokeDasharray = el.getTotalLength().toString();
				first = false;
			}
			for (const circle of circles) {
				circle.style.display = 'none';
			}
		}
	});

	// Update buttonInfo from localStorage on mount
	onMount(() => {
		window.addEventListener('keydown', handleKeyPress);
		const storedInfo = localStorage.getItem('navigation');
		if (storedInfo) {
			const parsedInfo: Record<string, ButtonInfo> = JSON.parse(storedInfo);
			const currentPath = getBasePath(page.url.pathname);
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
		const params = Object.values(page.params);
		const replaced = params.reduce((acc, param) => acc.replace(param, ''), pathname);
		return params.length > 0 ? replaced : pathname;
	}

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
			navigation_info = { ...navigation_info, [getBasePath(page.url.pathname)]: buttonInfo };
			localStorage.setItem('navigation', JSON.stringify(navigation_info));
		};
	}

	// Event handler for keydown on the main navigation button
	function handleMainKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			showRoutes = !showRoutes;
			e.preventDefault();
		}
	}

	// Event handler for keydown on endpoint buttons
	function handleEndpointKeydown(event: KeyboardEvent, endpoint: Endpoint): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleEndpointClick(endpoint);
		}
	}

	// Function to handle endpoint click
	function handleEndpointClick(endpoint: Endpoint): void {
		if (endpoint.action) {
			endpoint.action();
		} else if (endpoint.url.external) {
			location.href = endpoint.url.path || '/';
		} else {
			mode.set('view');
			handleSidebarToggle();
			goto(endpoint.url.path || '/');
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

	function isRightToLeft(): boolean {
		return document.documentElement.dir === 'rtl';
	}

	// Function to handle key presses
	function handleKeyPress(event: KeyboardEvent) {
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((v) => !v);
			triggerActionStore.set([]);
		}
	}

	function handleEscapeKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && showRoutes) {
			showRoutes = false;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleEscapeKey);
		return () => {
			window.removeEventListener('keydown', handleEscapeKey);
		};
	});
</script>

<!-- Main Navigation Button -->
<div
	bind:this={firstCircle}
	aria-label="Toggle Navigation Menu"
	role="button"
	aria-expanded={showRoutes}
	aria-haspopup="true"
	aria-controls="navigation-menu"
	use:drag
	class="bg-tertiary-500 fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-pointer touch-none items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 focus:scale-110 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:outline-hidden"
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;
           left:{(Math.min(isRightToLeft() ? buttonRadius : buttonInfo.x, window.innerWidth - buttonRadius) / window.innerWidth) * 100}%;"
	tabindex="0"
	onkeydown={handleMainKeyDown}
>
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white" aria-hidden="true"></iconify-icon>
</div>

<!-- Show the routes when the component is visible -->
{#if showRoutes}
	<div class="fixed inset-0 z-9999998" role="dialog" aria-modal="true" aria-label="Navigation Menu" transition:fade={{ duration: 150 }}>
		<!-- Large centered circle background -->
		<div
			class="bg-tertiary-500/40 fixed top-1/2 left-1/2 -z-10 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
			transition:scale={{ duration: 200, easing: elasticOut }}
		></div>

		<!-- SVG Lines -->
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash aria-hidden="true" class="absolute inset-0 h-full w-full">
			<line
				bind:this={firstLine}
				x1={buttonInfo.x}
				y1={buttonInfo.y}
				x2={center.x}
				y2={center.y}
				class="stroke-error-500 pointer-events-none stroke-2"
			/>
			{#each endpointsWithPositions.slice(1) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} class="stroke-error-500 pointer-events-none stroke-2" />
			{/each}
		</svg>

		<!-- Navigation Menu -->
		<div id="navigation-menu" role="menu" class="fixed inset-0 z-9999999">
			<!-- Center circle -->
			<div
				class="bg-tertiary-500/40 absolute top-1/2 left-1/2 -z-10 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
				transition:scale={{ duration: 200, easing: elasticOut }}
			></div>

			<!-- Home button -->
			<div
				bind:this={circles[0]}
				role="menuitem"
				aria-label={endpointsWithPositions[0].ariaLabel || endpointsWithPositions[0].label}
				tabindex="0"
				onclick={() => handleEndpointClick(endpointsWithPositions[0])}
				onkeydown={(event) => handleEndpointKeydown(event, endpointsWithPositions[0])}
				class="endpoint-circle group fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 bg-gray-600 transition-transform duration-200 hover:scale-110 focus:scale-110 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:outline-hidden"
				style="top:{center.y}px;left:{center.x}px;"
			>
				<iconify-icon width="32" style="color:white" icon="solar:home-bold" aria-hidden="true"></iconify-icon>
				<div
					class="tooltip absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+8px)] scale-90 rounded-sm bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100 group-focus:scale-100 group-focus:opacity-100"
					role="tooltip"
				>
					{endpointsWithPositions[0].label}
					<div class="tooltip-arrow"></div>
				</div>
			</div>

			<!-- Other endpoint buttons -->
			{#each endpointsWithPositions.slice(1) as endpoint, index}
				<div
					bind:this={circles[index + 1]}
					role="menuitem"
					aria-label={endpoint.ariaLabel || endpoint.label}
					tabindex="0"
					onclick={() => handleEndpointClick(endpoint)}
					onkeydown={(event) => handleEndpointKeydown(event, endpoint)}
					class="endpoint-circle group fixed z-99999999 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-transform duration-200 {endpoint.color ||
						'bg-tertiary-500'} hover:scale-110 focus:scale-110 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:outline-hidden"
					style="top:{endpoint.y}px;left:{endpoint.x}px;"
				>
					<iconify-icon width="32" style="color:white" icon={endpoint.icon} aria-hidden="true"></iconify-icon>
					<div
						class="tooltip absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+8px)] scale-90 rounded-sm bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100 group-focus:scale-100 group-focus:opacity-100"
						role="tooltip"
					>
						{endpoint.label}
						<div class="tooltip-arrow"></div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Close button overlay -->
		<button onclick={() => (showRoutes = false)} class="absolute inset-0 z-[-1] h-full w-full" aria-label="Close Navigation Menu"></button>
	</div>
{/if}

<style lang="postcss">
	/* Tooltip arrow */
	.tooltip-arrow {
		@apply absolute top-full left-1/2 hidden -translate-x-1/2;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 4px solid rgba(0, 0, 0, 0.8);
	}

	/* Endpoint animations */
	.endpoint-circle {
		opacity: 0;
		animation: showEndPoints 0.2s ease-out forwards;
	}

	@keyframes showEndPoints {
		0% {
			opacity: 0;
			visibility: hidden;
			transform: translate(-50%, -50%) scale(0.5);
		}
		100% {
			opacity: 1;
			visibility: visible;
			transform: translate(-50%, -50%) scale(1);
		}
	}
</style>
