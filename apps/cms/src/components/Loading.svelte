<!--
@file src/components/Loading.svelte
@component
**Loading component with animated circles and customizable text regions**

@example
<Loading customTopText="Please wait" customBottomText="Loading..." />

#### Props
- `customTopText` {string} - Custom text to display above the loading circles
- `customBottomText` {string} - Custom text to display below the loading circles

Features:
- Animated loading circles
- Customizable text regions
- Uses ParaglideJS for localization
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		// Props for custom text
		customTopText?: string | undefined;
		customBottomText?: string | undefined;
	}

	// Define component props with default values.
	let { customTopText = undefined, customBottomText = undefined }: Props = $props();

	// Reactive state to control the visibility of CSS animations.
	let isAnimating = $state(true);
	let animationTimeout: ReturnType<typeof setTimeout> | null = null;
	const animationDuration = 60000; // Stop animation after 60 seconds to prevent long-running processes.

	onMount(() => {
		// Set a timeout to stop the animation, acting as a safeguard.
		animationTimeout = setTimeout(() => {
			isAnimating = false;
		}, animationDuration);
	});

	onDestroy(() => {
		// Clear the timeout when the component is destroyed to prevent memory leaks.
		if (animationTimeout) {
			clearTimeout(animationTimeout);
		}
	});
</script>

<!-- The main container is positioned absolutely to fill its nearest relative parent. -->
<div
	class="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/50 shadow-2xl backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-label="Loading content, please wait"
>
	<!-- Animated loading spinners are only rendered if isAnimating is true. -->
	{#if isAnimating}
		<div class="relative h-[150px] w-[150px] rounded-full border-[7px] border-error-500 border-x-transparent" id="loader"></div>
		<div class="absolute h-[170px] w-[170px] rounded-full border-[6px] border-success-400 border-x-transparent" id="loader2"></div>
		<div class="absolute h-[190px] w-[190px] rounded-full border-[5px] border-tertiary-400 border-x-transparent" id="loader3"></div>
		<div class="absolute h-[210px] w-[210px] rounded-full border-[4px] border-surface-400 border-x-transparent" id="loader4"></div>
	{/if}
	<!-- The central content area for the logo and text. -->
	<div class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white">
		<div>{customTopText || m.loading_pleasewait()}</div>
		<div><SveltyCMSLogo className="w-14 p-1" fill="red" /></div>
		<div>{customBottomText || m.loading_loading()}</div>
	</div>
</div>

<style lang="postcss">
	/* Animation for the first and third loaders. */
	#loader {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	/* Animation for the second and fourth loaders, rotating in the opposite direction. */
	#loader2 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader3 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader4 {
		animation: rotate2 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	/* Keyframes for clockwise rotation. */
	@keyframes rotate {
		0% {
			transform: rotateZ(-360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
	/* Keyframes for counter-clockwise rotation. */
	@keyframes rotate2 {
		0% {
			transform: rotateZ(360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
</style>
