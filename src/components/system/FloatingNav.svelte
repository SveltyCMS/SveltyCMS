<script lang="ts">
	import { goto } from '$app/navigation';
	import { motion } from '@src/utils/utils';

	import { fade } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { tick } from 'svelte';

	// Auth
	import type { User } from '@src/auth/types';

	// Stores
	import { page } from '$app/stores';
	import { mode } from '@src/stores/store';
	import { handleSidebarToggle } from '@src/stores/sidebarStore';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	let navigation_info = JSON.parse(localStorage.getItem('navigation') || '{}');
	const buttonRadius = 25; // home button size
	let showRoutes = false;
	let center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
	const circles: HTMLDivElement[] = [];
	let svg: SVGElement;
	let user: User = $page.data.user;

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
			url: { external: false, path: `/collection` },
			icon: 'icomoon-free:wrench'
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
		// {
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

	export let buttonInfo: any;

	// Adjust button position on window resize
	window.onresize = async () => {
		buttonInfo.x = window.innerWidth - buttonRadius * 3;
		buttonInfo.y = window.innerHeight - buttonRadius * 3;
		firstLine && firstLine.setAttribute('x1', firstCircle.offsetLeft.toString());
		firstLine && firstLine.setAttribute('y1', firstCircle.offsetTop.toString());
		await tick();
		firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
	};

	function getBasePath(pathname: string) {
		const params = Object.values($page.params);
		const replaced = params.reduce((acc, param) => {
			acc = acc.replace(param, '');
			return acc;
		}, pathname);
		return params.length > 0 ? replaced : pathname;
	}

	// Set default button position to bottom-right of the screen
	$: buttonInfo = {
		x: window.innerWidth - buttonRadius * 3, // right corner, adjusted inward by button's diameter
		y: window.innerHeight - buttonRadius * 3, // bottom corner, adjusted inward
		radius: buttonRadius
	};

	// Function to calculate endpoint coordinates and angles
	function calculateEndpoint(index: number, totalEndpoints: number, radius: number) {
		const angle = ((Math.PI * 2) / totalEndpoints) * (index + 1.25); // Adjust angle for centering
		const x = center.x + radius * Math.cos(angle);
		const y = center.y + radius * Math.sin(angle);
		return { x, y, angle };
	}

	// Calculate endpoint positions and angles based on their index
	$: endpoints = endpoints.map((endpoint, index) => ({
		...endpoint,
		...calculateEndpoint(index, endpoints.length, 140) // Adjust radius as needed
	}));

	// Show the routes when the component is visible
	function drag(node: HTMLDivElement) {
		let moved = false;
		let timeout: ReturnType<typeof setTimeout>;
		node.onpointerdown = (e) => {
			timeout = setTimeout(() => {
				const x = e.offsetX - node.offsetWidth / 2;
				const y = e.offsetY - node.offsetHeight / 2;
				buttonInfo = { ...buttonInfo, x: e.clientX - x, y: e.clientY - y };
				node.setPointerCapture(e.pointerId);
				node.onpointermove = (e) => {
					moved = true;
					buttonInfo = { ...buttonInfo, x: e.clientX - x, y: e.clientY - y };
					firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
				};
			}, 60);
		};
		node.onpointerup = async (e) => {
			if (!moved) {
				showRoutes = !showRoutes;
			}

			timeout && clearTimeout(timeout);
			moved = false;
			node.onpointermove = null;
			node.releasePointerCapture(e.pointerId);

			const distance = [
				buttonInfo.x, //left
				window.innerWidth - buttonInfo.x, //right
				buttonInfo.y, //top
				window.innerHeight - buttonInfo.y //bottom
			];

			let promise: any;

			switch (distance.indexOf(Math.min(...distance))) {
				case 0:
					{
						promise = motion(buttonInfo.x, buttonRadius, 200, async (t) => {
							buttonInfo.x = t;
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 1:
					{
						promise = motion(buttonInfo.x, window.innerWidth - buttonRadius, 200, async (t) => {
							buttonInfo.x = t;
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 2:
					{
						promise = motion(buttonInfo.y, buttonRadius, 200, async (t) => {
							buttonInfo.y = t;
							await tick();
							firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
						});
					}
					break;
				case 3:
					{
						promise = motion(buttonInfo.y, window.innerHeight - buttonRadius, 200, async (t) => {
							buttonInfo.y = t;
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

	// Function to handle key presses
	// function handleKeyPress(event: KeyboardEvent) {
	// 	if (event.altKey && event.key === 's') {
	// 	}
	//}
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
	<iconify-icon icon="tdesign:map-route-planning" width="36" style="color:white" />
</div>

<!-- Show the routes when the component is visible -->
{#if showRoutes}
	<button out:keepAlive|local on:click|self={() => (showRoutes = false)} class=" fixed left-0 top-0 z-[9999999]">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpoints.slice(1, endpoints.length) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>

		<!-- Home button -->
		<div
			transition:fade
			class="absolute left-1/2 top-1/4 -z-10 !h-[340px] !w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-tertiary-500/40"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
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
				handleSidebarToggle();
				endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
				showRoutes = false;
			}}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					// Trigger the same action as on:click
					mode.set('view');
					modalStore.clear();
					handleSidebarToggle();
					endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
					showRoutes = false;
				}
			}}
			class="circle flex items-center justify-center border-2 bg-gray-600"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		>
			<iconify-icon width="32" style="color:white" icon="solar:home-bold" />
		</div>

		{#each endpoints.slice(1, endpoints.length) as endpoint, index}
			<div
				bind:this={circles[index + 1]}
				typeof="button"
				role={endpoint.icon}
				aria-label={endpoint.icon}
				on:click={() => {
					endpoint?.url?.external ? (location.href = endpoint?.url?.path || '/') : goto(endpoint?.url?.path || '/');
					showRoutes = false;
				}}
				class="circle flex items-center justify-center {endpoint.color || 'bg-tertiary-500'}"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation: showEndPoints 0.2s 0.4s forwards"
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
