<!--
@file src/components/Loading.svelte
@component
**Loading component with animated circles and customizable text regions**

@example
<Loading customTopText="Please wait" customBottomText="Loading..." />

### Props
- `customTopText` {string} - Custom text to display above the loading circles
- `customBottomText` {string} - Custom text to display below the loading circles

### Features:
- Animated loading circles
- Customizable text regions
- Uses ParaglideJS for localization
-->
<script lang="ts">
	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		customTopText?: string | undefined;
		customBottomText?: string | undefined;
	}

	// Define component props with default values.
	let { customTopText = undefined, customBottomText = undefined }: Props = $props();

	// No script logic needed for animations anymore
</script>

<!-- The main container is positioned absolutely to fill its nearest relative parent. -->
<div
	class="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/50 shadow-2xl backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-label="Loading content, please wait"
>
	<div class="loader-1"></div>
	<div class="loader-2"></div>
	<div class="loader-3"></div>
	<div class="loader-4"></div>

	<div class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white">
		<div>{customTopText ?? m.loading_pleasewait()}</div>
		<div><SveltyCMSLogo className="w-14 p-1" fill="red" /></div>
		<div>{customBottomText ?? m.loading_loading()}</div>
	</div>
</div>

<style lang="postcss">
	/* Base styles for loaders */
	.loader-1,
	.loader-2,
	.loader-3,
	.loader-4 {
		position: absolute; /* Changed from relative/absolute mix */
		border-radius: 50%;
		border-style: solid;
		border-left-color: transparent;
		border-right-color: transparent;
	}

	/* Individual loader styles and animations */
	.loader-1 {
		@apply h-[150px] w-[150px] border-[7px] border-error-500;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-2 {
		@apply h-[170px] w-[170px] border-[6px] border-success-400;
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-3 {
		@apply h-[190px] w-[190px] border-[5px] border-tertiary-400;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	.loader-4 {
		@apply h-[210px] w-[210px] border-[4px] border-surface-400;
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
