<!--
@file src/components/Loading.svelte
@component
**Local loading component with animated circles and customizable text**

@example
<Loading customTopText="Please wait" customBottomText="Loading..." />

#### Props
- `customTopText` {string} - Custom text to display above the loading circles
- `customBottomText` {string} - Custom text to display below the loading circles

#### Features
- Animated loading circles with smooth performance
- Customizable text regions with fallback to localized defaults
- Absolute positioning to overlay parent container
- Accessible with ARIA labels
- Uses ParaglideJS for localization
-->

<script lang="ts">
	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';

	// i18n
	import * as m from '@src/paraglide/messages';

	interface Props {
		customTopText?: string;
		customBottomText?: string;
	}

	let { customTopText, customBottomText }: Props = $props();

	// Derived text with fallbacks
	const topText = $derived(customTopText ?? m.loading_pleasewait());
	const bottomText = $derived(customBottomText ?? m.loading_loading());
</script>

<div
	class="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm"
	role="status"
	aria-live="polite"
	aria-busy="true"
	aria-label="{topText} - {bottomText}"
>
	<!-- Animated loading circles -->
	<div class="loader loader-1" aria-hidden="true"></div>
	<div class="loader loader-2" aria-hidden="true"></div>
	<div class="loader loader-3" aria-hidden="true"></div>
	<div class="loader loader-4" aria-hidden="true"></div>

	<!-- Loading content -->
	<div class="absolute flex flex-col items-center justify-center space-y-2 rounded-full bg-transparent p-6 text-center">
		<p class="text-sm font-medium uppercase tracking-wide text-black dark:text-white">
			{topText}
		</p>
		<div class="flex items-center justify-center">
			<SveltyCMSLogo className="w-14 p-1" fill="red" />
		</div>
		<p class="text-xs uppercase text-black opacity-80 dark:text-white">
			{bottomText}
		</p>
	</div>
</div>

<style lang="postcss">
	/* Base loader styles */
	.loader {
		position: absolute;
		border-radius: 50%;
		border-style: solid;
		border-left-color: transparent;
		border-right-color: transparent;
	}

	/* Individual loader animations */
	.loader-1 {
		@apply h-[150px] w-[150px] border-[7px] border-error-500;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-2 {
		@apply h-[170px] w-[170px] border-[6px] border-success-400;
		animation: rotate-reverse 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-3 {
		@apply h-[190px] w-[190px] border-[5px] border-tertiary-400;
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	.loader-4 {
		@apply h-[210px] w-[210px] border-[4px] border-surface-400;
		animation: rotate-reverse 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}

	/* Rotation animations */
	@keyframes rotate {
		from {
			transform: rotateZ(-360deg);
		}
		to {
			transform: rotateZ(0deg);
		}
	}

	@keyframes rotate-reverse {
		from {
			transform: rotateZ(360deg);
		}
		to {
			transform: rotateZ(0deg);
		}
	}
</style>
