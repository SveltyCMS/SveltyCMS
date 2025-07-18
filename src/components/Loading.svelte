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

	let { customTopText = undefined, customBottomText = undefined }: Props = $props();

	let isAnimating = $state(true);
	let animationTimeout: ReturnType<typeof setTimeout> | null = null;
	const animationDuration = 60000; // 60 seconds

	onMount(() => {
		// Stop animations after the specified duration
		animationTimeout = setTimeout(() => {
			isAnimating = false;
		}, animationDuration);
	});

	onDestroy(() => {
		// Clean up the timeout if the component is destroyed before it finishes
		if (animationTimeout) {
			clearTimeout(animationTimeout);
		}
	});
</script>

<div class="absolute inset-0 flex items-center justify-center shadow-2xl" role="status" aria-live="polite" aria-label="Loading content, please wait">
	{#if isAnimating}
		<div class="relative h-[150px] w-[150px] rounded-full border-[7px] border-error-500 border-x-transparent" id="loader"></div>
		<div class="absolute h-[170px] w-[170px] rounded-full border-[6px] border-success-400 border-x-transparent" id="loader2"></div>
		<div class="absolute h-[190px] w-[190px] rounded-full border-[5px] border-tertiary-400 border-x-transparent" id="loader3"></div>
		<div class="absolute h-[210px] w-[210px] rounded-full border-[4px] border-surface-400 border-x-transparent" id="loader4"></div>
	{/if}
	<div class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white">
		<div>{customTopText || m.loading_pleasewait()}</div>
		<div><SveltyCMSLogo className="w-14 p-1" fill="red" /></div>
		<div>{customBottomText || m.loading_loading()}</div>
	</div>
</div>

<style lang="postcss">
	#loader {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader2 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader3 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader4 {
		animation: rotate2 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	@keyframes rotate {
		0% {
			transform: rotateZ(-360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
	@keyframes rotate2 {
		0% {
			transform: rotateZ(360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
</style>
