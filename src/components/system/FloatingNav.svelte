<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import RoutesIcon from '@src/components/system/icons/RoutesIcon.svelte';
	import { linear } from 'svelte/easing';
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { motion } from '@src/utils/utils';
	let navigation_info = JSON.parse(localStorage.getItem('navigation') || '{}');
	let buttonRadius = 25;
	export let buttonInfo;
	let showRoutes = false;
	let center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
		x: 50,
		y: window.innerHeight / 2,
		radius: buttonRadius
	};
	let firstLine: SVGLineElement;
	let firstCircle: HTMLDivElement;
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
			x: 0,
			y: 0,
			url: { external: false, path: `/builder` },
			icon: 'icomoon-free:wrench'
		},
		{
			x: 0,
			y: 0,
			url: { external: false, path: `/profile` },
			icon: 'radix-icons:avatar'
		},
		{
			x: 0,
			y: 0,
			url: { external: true, path: `/api/graphql` },
			icon: 'teenyicons:graphql-outline'
		}
	];
	let circles: HTMLDivElement[] = [];
	// Function to calculate the coordinates of the endpoint of a vector
	function calculateSecondVector(startX, startY, x1, y1, distance, angle) {
		let firstAngle = Math.atan2(y1 - startY, x1 - startX) * (180 / Math.PI);
		let x2 = Math.round(Math.cos(((firstAngle - angle) * Math.PI) / 180) * distance + x1);
		let y2 = Math.round(Math.sin(((firstAngle - angle) * Math.PI) / 180) * distance + y1);
		return { x: x2, y: y2 };
	}
	$: endpoints[1] = { ...endpoints[1], ...calculateSecondVector(buttonInfo.x, buttonInfo.y, center.x, center.y, 140, 60) };
	$: endpoints[2] = { ...endpoints[2], ...calculateSecondVector(buttonInfo.x, buttonInfo.y, center.x, center.y, 140, 0) };
	$: endpoints[3] = { ...endpoints[3], ...calculateSecondVector(buttonInfo.x, buttonInfo.y, center.x, center.y, 140, -60) };

	function drag(node: HTMLDivElement) {
		let moved = false;
		let timeout: ReturnType<typeof setTimeout>;
		node.onpointerdown = (e) => {
			timeout = setTimeout(() => {
				let x = e.offsetX - node.offsetWidth / 2;
				let y = e.offsetY - node.offsetHeight / 2;
				buttonInfo = { x: e.clientX - x, y: e.clientY - y };
				node.setPointerCapture(e.pointerId);
				node.onpointermove = (e) => {
					moved = true;
					buttonInfo = { x: e.clientX - x, y: e.clientY - y };
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
	$: if (!showRoutes) reverse();
	function keepAlive(node, { delay = 0, duration = 400, easing: easing$1 = linear } = {}) {
		return {
			delay,
			duration,
			easing: easing$1,
			css: (t) => ``
		};
	}
</script>

<div
	bind:this={firstCircle}
	use:drag
	class="circle relative flex touch-none items-center justify-center"
	style="top:{(Math.min(buttonInfo.y, window.innerHeight - buttonRadius) / window.innerHeight) * 100}%;left:{(Math.min(
		buttonInfo.x,
		window.innerWidth - buttonRadius
	) /
		window.innerWidth) *
		100}%;width:{buttonRadius * 2}px;height:{buttonRadius * 2}px"
>
	<RoutesIcon />
</div>
{#if showRoutes}
	<button out:keepAlive|local on:click|self={() => (showRoutes = false)} class=" fixed left-0 top-0 z-[9999999]">
		<svg bind:this={svg} xmlns="http://www.w3.org/2000/svg" use:setDash>
			<line bind:this={firstLine} x1={buttonInfo.x} y1={buttonInfo.y} x2={center.x} y2={center.y} />
			{#each endpoints.slice(1, endpoints.length) as endpoint}
				<line x1={center.x} y1={center.y} x2={endpoint.x} y2={endpoint.y} />
			{/each}
		</svg>
		<!-- HOME -->
		<div
			transition:fade
			class="shell"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		></div>
		<div
			bind:this={circles[0]}
			on:click={() => {
				endpoints[0]?.url?.external ? (location.href = endpoints[0]?.url?.path || '/') : goto(endpoints[0]?.url?.path || '/');
				showRoutes = false;
			}}
			class="circle flex items-center justify-center"
			style="top:{center.y}px;left:{center.x}px;visibility:hidden; animation: showEndPoints 0.2s 0.2s forwards"
		>
			<iconify-icon width="30" style="color:white" icon="solar:home-bold" />
		</div>
		{#each endpoints.slice(1, endpoints.length) as endpoint, index}
			<div
				bind:this={circles[index + 1]}
				on:click={() => {
					endpoint?.url?.external ? (location.href = endpoint?.url?.path || '/') : goto(endpoint?.url?.path || '/');
					showRoutes = false;
				}}
				class="circle flex items-center justify-center opacity-0"
				style="top:{endpoint.y}px;left:{endpoint.x}px;animation: showEndPoints 0.2s 0.4s forwards"
			>
				<iconify-icon width="30" style="color:white" icon={endpoint.icon} />
			</div>
		{/each}
	</button>
{/if}

<style>
	div {
		width: 100vw;
		height: 100vh;
	}
	.shell {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 340px;
		height: 340px;
		border-radius: 50%;
		background-color: #37d1e759;
		z-index: -1;
		backdrop-filter: blur(15px);
	}
	svg {
		position: fixed;
		left: 0;
		top: 0;
		height: 100%;
		width: 100%;
		pointer-events: none;
	}
	.circle {
		position: fixed;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		width: 50px;
		height: 50px;
		background-color: #26bdff;
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

	line {
		stroke: #da1f1f;
		stroke-width: 4;
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
