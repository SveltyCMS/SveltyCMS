<script>
	import { createEventDispatcher } from 'svelte';
	import { storeListboxValue } from '@src/stores/store';

	const dispatch = createEventDispatcher();

	export let iconMode = 'cross';
	export let checked = false;

	//console.log('checked in TanstackIcons:', checked);
	//console.log('storeListboxValue in TanstackIcons:', $storeListboxValue);

	function handleIconClick() {
		checked = !checked;
		dispatch('iconClick');

		// Update storeListboxValue based on current value and desired behavior
		if ($storeListboxValue === 'create') {
			storeListboxValue.set('delete');
		}
	}
</script>

<button
	class="flex h-[26px] w-[26px] items-center justify-center rounded-md border-2 border-surface-800 dark:border-surface-400 {$$props.class}"
	on:keydown
	on:click|stopPropagation={handleIconClick}
>
	{#if checked && iconMode === 'cross'}
		<!--Red Cross icon 3d-->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			fill="none"
			viewBox="0 0 224 224"
		>
			<mask
				id="a"
				width="224"
				height="224"
				x="0"
				y="0"
				maskUnits="userSpaceOnUse"
				style="mask-type:alpha"
			>
				<path
					fill="#fff"
					d="M48 1c-6 2-11 5-26 21C2 41-1 47 1 54c2 6 7 12 31 36l23 22-26 26c-30 30-32 33-27 43 2 4 32 35 39 40 5 4 11 4 17 1l29-27 25-25 26 25 29 27c5 2 12 2 16 0l39-39c2-5 2-11 0-16-2-3-12-15-27-29l-24-26 24-25 27-29c2-5 2-12 0-16-4-6-37-38-41-40-6-3-7-3-13 0-4 2-11 8-31 28l-25 25-24-25C61 3 55-1 48 1Z"
				/>
			</mask>
			<g mask="url(#a)">
				<path
					fill="url(#b)"
					stroke="#950404"
					stroke-width="6"
					d="M48 1c-6 2-11 5-26 21C2 41-1 47 1 54c2 6 7 12 31 36l23 22-26 26c-30 30-32 33-27 43 2 4 32 35 39 40 5 4 11 4 17 1l29-27 25-25 26 25 29 27c5 2 12 2 16 0l39-39c2-5 2-11 0-16-2-3-12-15-27-29l-24-26 24-25 27-29c2-5 2-12 0-16-4-6-37-38-41-40-6-3-7-3-13 0-4 2-11 8-31 28l-25 25-24-25C61 3 55-1 48 1Z"
				/>
				<path
					fill="#9E120F"
					d="M65 208c1 1-8 7-7 9 1 1 0 2 2 2l2-1 5-4 6-5 8-7 8-9 10-11 6-7 6-7 1-2-1-2-2 1-5 5-6 5-6 6-8 8-8 8-11 11Z"
				/>
				<path
					fill="url(#c)"
					d="M174 94c1 1-8 7-7 9 1 1 0 2 2 2l2-1 5-4 7-6 7-7 8-8 10-11 6-8 5-4 2-3-1-3h-3l-5 6-6 4-6 7-8 8-8 8-10 11Z"
				/>
				<path
					fill="url(#d)"
					d="M49 103c0-1 8 7 10 5v-2l-5-6-5-7-8-9-9-9-11-11-8-8-8-6-1-1-2 1v3l6 6 5 6 7 8 8 8 9 10 12 12Z"
				/>
				<path
					fill="url(#e)"
					d="M120 53c1 0-10 7-8 10l2 1 3-1 6-4 8-7 9-8 10-10 11-13 8-9 7-8 1-2-1-1h-4l-6 7-7 5-7 7-9 10-11 9-12 14Z"
				/>
				<path
					fill="url(#f)"
					d="M12 162c1 0-10 7-8 10l2 1 3-1 6-4 8-7 9-8 10-10 11-13 8-9 7-8 1-2-1-1h-4l-6 7-7 5-7 7-9 10-11 9-12 14Z"
				/>
				<path
					fill="url(#g)"
					d="M100 56c1 0 8 10 10 8 1-1 2 0 2-2l-1-3-5-5-7-8-8-8-10-10-13-11-9-7-8-7h-2l-2 1 1 3 6 6 6 6 7 8 10 8 9 10 14 11Z"
				/>
				<path
					fill="url(#h)"
					d="M212 166c0-1 8 9 10 8 1-1 2-1 2-3l-1-2-5-6-7-8-8-8-10-10-13-11-9-7-8-7h-2l-2 1 1 3 6 6 6 7 7 7 10 9 9 10 14 11Z"
				/>
				<path
					fill="url(#i)"
					d="M126 168c-1 0-7-9-9-8-1 1-2 0-2 2l1 3 4 5 6 7 7 8 9 10 12 11 8 7 7 6 2 1 1-1v-3l-6-6-4-6-7-7-8-8-9-10-12-11Z"
				/>
			</g>
			<defs>
				<radialGradient
					id="b"
					cx="0"
					cy="0"
					r="1"
					gradientTransform="rotate(-90 112 0) scale(112)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" stop-color="#D24644" />
					<stop offset=".2" stop-color="#D8514F" />
					<stop offset=".5" stop-color="#E24C4A" />
					<stop offset=".8" stop-color="#E04E4C" />
					<stop offset="1" stop-color="#C93331" />
				</radialGradient>
				<radialGradient
					id="e"
					cx="0"
					cy="0"
					r="1"
					gradientTransform="matrix(32 0 0 32 144 33)"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#F79496" />
					<stop offset="1" stop-color="#F78B8D" stop-opacity="0" />
				</radialGradient>
				<radialGradient
					id="f"
					cx="0"
					cy="0"
					r="1"
					gradientTransform="matrix(32 0 0 32 36 142)"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#F79496" />
					<stop offset="1" stop-color="#F78B8D" stop-opacity="0" />
				</radialGradient>
				<radialGradient
					id="g"
					cx="0"
					cy="0"
					r="1"
					gradientTransform="matrix(-1 -32 32 -1 79 34)"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#F4C8C8" />
					<stop offset="1" stop-color="#FF0302" stop-opacity="0" />
				</radialGradient>
				<radialGradient
					id="h"
					cx="0"
					cy="0"
					r="1"
					gradientTransform="matrix(-1 -32 32 -1 191 143)"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#F4C8C8" />
					<stop offset="1" stop-color="#FF0302" stop-opacity="0" />
				</radialGradient>
				<linearGradient
					id="c"
					x1="227.5"
					x2="141"
					y1="125"
					y2="51.5"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#AF0D0A" />
					<stop offset=".5" stop-color="#AF0D0A" stop-opacity=".6" />
					<stop offset="1" stop-color="#F2DAD9" stop-opacity="0" />
				</linearGradient>
				<linearGradient
					id="d"
					x1="29.7"
					x2="96.5"
					y1="107.8"
					y2="30.5"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#850E0C" />
					<stop offset=".5" stop-color="#AA1A18" stop-opacity=".6" />
					<stop offset="1" stop-color="#AF0D0A" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="i" x1="153.5" x2="185" y1="212" y2="182" gradientUnits="userSpaceOnUse">
					<stop stop-color="#7B0E0C" />
					<stop offset=".2" stop-color="#AF0D0A" />
					<stop offset="1" stop-color="#FBFBFB" stop-opacity="0" />
				</linearGradient>
			</defs>
		</svg>
	{:else if checked && iconMode === 'tick'}
		<!--Green Check icon 3d-->
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
			<defs>
				<filter id="j" color-interpolation-filters="sRGB">
					<feGaussianBlur stdDeviation="2.42583" />
				</filter>
				<filter id="k" color-interpolation-filters="sRGB">
					<feGaussianBlur stdDeviation="1.10623" />
				</filter>
				<filter
					id="i"
					width="1.517"
					height="1.1179"
					x="-.2585"
					y="-.05894"
					color-interpolation-filters="sRGB"
				>
					<feGaussianBlur stdDeviation=".81429" />
				</filter>
				<filter id="g" color-interpolation-filters="sRGB">
					<feGaussianBlur stdDeviation="1.64844" />
				</filter>
				<filter id="h" color-interpolation-filters="sRGB">
					<feGaussianBlur stdDeviation=".99941" />
				</filter>
				<filter id="a" color-interpolation-filters="sRGB">
					<feGaussianBlur stdDeviation="11.73947" />
				</filter>
				<radialGradient
					id="b"
					cx="229.21"
					cy="238.62"
					r="102.53"
					gradientTransform="matrix(.81737 .57611 -1.8271 2.5923 462.04 67.492)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" style="stop-color:#d6f948" />
					<stop offset="1" style="stop-color:#67a226" />
				</radialGradient>
				<radialGradient
					id="c"
					cx="62.352"
					cy="316.37"
					r="237.72"
					gradientTransform="matrix(-.29991 1.5184 -1.3648 -.26959 674.59 613.64)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" style="stop-color:#b8f714" />
					<stop offset="1" style="stop-color:#478c20" />
				</radialGradient>
				<radialGradient
					id="d"
					cx="127.34"
					cy="285.55"
					r="54.928"
					gradientTransform="matrix(.3901 -.53963 1.7887 1.2931 -450.3 518.97)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" style="stop-color:#b5f948" />
					<stop offset="1" style="stop-color:#60a226" />
				</radialGradient>
				<radialGradient
					id="e"
					cx="59.431"
					cy="269.24"
					r="27.633"
					gradientTransform="matrix(-1.2347 -.70514 1.4443 -2.5289 -253.85 1509.6)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" style="stop-color:#c8f948" />
					<stop offset="1" style="stop-color:#67a226" />
				</radialGradient>
				<radialGradient
					id="f"
					cx="482.8"
					cy="113.38"
					r="59.109"
					gradientTransform="matrix(1.2452 -1.3398 1.3318 1.2377 -263.13 1172.6)"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" style="stop-color:#a7e507" />
					<stop offset="1" style="stop-color:#559a09" />
				</radialGradient>
			</defs>
			<path
				d="M374.69 571.52c-11.01 10.85-123.44 166.02-198.16 267.53L68.25 765.488l-53.625 91.438 2.4688 27.938s176 149.06 187.75 148.53c13.159-.5867 204.82-236.02 286.69-342.19-23.597-17.702-41.218-31.783-57.25-44.656l57.25 44.656.375-27.719c-42.88-38.44-73.73-71.2-117.23-91.96zM204.5 848.4c-9.8124 13.71-19.075 26.544-27.406 37.938L204.5 848.4z"
				style="filter:url(#a);fill-opacity:.83404;fill:#000"
				transform="matrix(.97172 0 0 .98958 10.055 -529.592)"
			/>
			<path
				d="M383.83 594.04c7.5567-15.813 3.2215-25.68-5.8978-33.154-11.016 10.858-123.45 166.04-198.17 267.55l.57401 47.279z"
				style="fill:url(#b)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M383.83 594.04c-4.9602-1.6394-134.95 187.94-203.49 281.68-32.889-26.82-65.696-53.64-108.21-80.461-24.176 23.175-26.582 24.503-51.791 78.99 0 0 175.99 149.04 187.74 148.52 13.159-.5867 204.83-236.03 286.7-342.19-50.09-37.578-73.652-59.099-110.95-86.535z"
				style="fill:url(#c)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="m180.34 875.72-.57-47.28-108.28-73.59.647 40.41z"
				style="fill:url(#d)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="m72.137 795.26-.65012-40.408-53.615 91.461 2.4746 27.937z"
				style="fill:url(#e)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="m494.79 680.58.36596-27.703c-42.875-38.441-73.718-71.219-117.22-91.987 7.9037 15.957 5.8978 33.154 5.8978 33.154z"
				style="fill:url(#f)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M467.09 662.84c-108.67 166.37-205.08 223.9-337.91 298.58l16.159 12.917c178.43-117.14 283.26-213.04 336.31-299.49z"
				style="filter:url(#g);fill:url(#radialGradient5010)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M296.7 924.15c-46.581-2.1421-105.16 25.246-133.41 65.837 0 0 40.533 1.8047 61.939-1.2994s36.157-27.576 71.468-64.537z"
				style="opacity:.75556;filter:url(#h);fill:url(#radialGradient5012)"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M379.29 566.32c6.9436 14.038 8.2202 20.058 4.5397 27.722"
				style="filter:url(#i);stroke:url(#linearGradient5014);stroke-linecap:round;stroke-width:5;fill:none"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M383.83 594.04 180.34 875.72"
				style="filter:url(#j);stroke:url(#radialGradient5016);stroke-width:5;fill:none"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M70.737 796.46c34.322 18.086 70.895 47.429 108.21 80.461"
				style="filter:url(#j);stroke:url(#radialGradient5018);stroke-width:5;fill:none"
				transform="translate(0 -540.36)"
			/>
			<path
				d="M74.837 797.59c-23.195 21.469-43.011 63.218-53.067 77.077"
				style="filter:url(#k);stroke:url(#radialGradient5020);stroke-width:7;fill:none"
				transform="translate(0 -540.36)"
			/>
		</svg>
	{/if}
</button>
