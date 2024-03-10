<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import RoutesIcon from '@src/components/system/icons/RoutesIcon.svelte';
	import { linear } from 'svelte/easing';
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { motion } from '@src/utils/utils';
	import { mode } from '@src/stores/store';
	import { handleSidebarToggle } from '@src/stores/sidebarStore';
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	let navigation_info = JSON.parse(localStorage.getItem('navigation') || '{}');
	let buttonRadius = 25; // home button size
	let showRoutes = false;
	let center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
	let circles: HTMLDivElement[] = [];
	let svg: SVGElement;

	let endpoints: {
		x: number;
		y: number;
		url: {
			external: boolean;
			path: string;
		};
		icon: string;
	}[] = [
		{
			x: center.x,
			y: center.y,
			url: { external: false, path: `/` },
			icon: 'solar:home-bold'
		},
		{
			x: center.x,
			y: center.y,
			url: { external: false, path: `/collection` },
			icon: 'icomoon-free:wrench'
		},
		{
			x: center.x,
			y: center.y,
			url: { external: false, path: `/user` },
			icon: 'radix-icons:avatar'
		},
		{
			x: center.x,
			y: center.y,
			url: { external: true, path: `/api/graphql` },
			icon: 'teenyicons:graphql-outline'
		},
		{
			x: center.x,
			y: center.y,
			url: { external: true, path: `/config` },
			icon: 'mynaui:config'
		}
	];

	export let buttonInfo: any;

	window.onresize = async () => {
		center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		firstLine && firstLine.setAttribute('x1', firstCircle.offsetLeft.toString());
		firstLine && firstLine.setAttribute('y1', firstCircle.offsetTop.toString());
		await tick();
		firstLine && (firstLine.style.strokeDasharray = firstLine.getTotalLength().toString());
	};

	function getBasePath(pathname: string) {
		let params = Object.values($page.params);
		let replaced = params.reduce((acc, param) => {
			acc = acc.replace(param, '');
			return acc;
		}, pathname);
		return params.length > 0 ? replaced : pathname;
	}

	$: buttonInfo = { ...navigation_info?.[getBasePath($page.url.pathname)], ...{ radius: buttonRadius } } || {
		x: 75,
		y: window.innerHeight / 2,
		radius: buttonRadius
	};

	// Function to calculate the coordinates of the endpoint of a vector
	function calculateSecondVector(startX, startY, x1, y1, distance, angle) {
		let firstAngle = Math.atan2(y1 - startY, x1 - startX) * (180 / Math.PI);
		let x2 = Math.round(Math.cos(((firstAngle - angle) * Math.PI) / 180) * distance + x1);
		let y2 = Math.round(Math.sin(((firstAngle - angle) * Math.PI) / 180) * distance + y1);
		return { x: x2, y: y2 };
	}

	// Calculate the coordinates of the endpoints
	$: endpoints = endpoints.map((endpoint, index) => ({
		...endpoint,
		...(index === 0 ? {} : calculateSecondVector(buttonInfo.x, buttonInfo.y, center.x, center.y, 140, 50 * (index - 1)))
	}));

	// Show the routes when the component is visible
	function drag(node: HTMLDivElement) {
		let moved = false;
		let timeout: ReturnType<typeof setTimeout>;
		node.onpointerdown = (e) => {
			timeout = setTimeout(() => {
				let x = e.offsetX - node.offsetWidth / 2;
				let y = e.offsetY - node.offsetHeight / 2;
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

			let distance = [
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
		for (let lineElement of node.children) {
			let el = lineElement as SVGLineElement;
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
		for (let lineElement of svg.children) {
			let el = lineElement as SVGLineElement;
			el.style.transition = first ? 'stroke-dashoffset 0.2s 0.2s' : 'stroke-dashoffset 0.2s ';
			el.style.strokeDashoffset = el.style.strokeDasharray = el.getTotalLength().toString();
			first = false;
		}
		for (let circle of circles) {
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
</script>

<!-- Start  Nav Button-->
<div
	bind:this={firstCircle}
	aria-label="Open navigation"
	role="button"
	aria-expanded={showRoutes}
	use:drag
	class="circle flex touch-none items-center justify-center bg-tertiary-500"
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;left:{(Math.min(
		buttonInfo.x,
		window.innerWidth - buttonRadius
	) /
		window.innerWidth) *
		100}%;width:{buttonRadius * 2}px;height:{buttonRadius * 2}px"
>
	<RoutesIcon />
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
		<button
			bind:this={circles[0]}
			typeof="button"
			aria-label="Home"
			on:click={() => {
				mode.set('view');
				modalStore.clear();
				handleSidebarToggle();
				endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
				showRoutes = false;
			}}
			class="circle flex items-center justify-center bg-primary-500"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		>
			<iconify-icon width="30" style="color:white" icon="solar:home-bold" />
		</button>

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
				class="circle flex items-center justify-center bg-tertiary-500 opacity-0"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation: showEndPoints 0.2s 0.4s forwards"
			>
				<!-- Icon for the button -->
				<iconify-icon width="30" style="color:white" icon={endpoint.icon} />
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
