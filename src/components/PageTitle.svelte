<!-- 
@file src/components/PageTitle.svelte
@description PageTitle component

Functions
@prop {string} name - The name of the page
@prop {string} icon - The icon of the page
@prop {string} iconColor - The color of the icon
@prop {string} iconSize - The size of the icon
@prop {boolean} showBackButton - Whether to show the back button
@prop {string} backUrl - The URL to go back to
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Stores
	import { get } from 'svelte/store';
	import { sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

	interface PageTitleProps {
		name: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
	}

	export let name: PageTitleProps['name'];
	export let icon: PageTitleProps['icon'];
	export let iconColor: PageTitleProps['iconColor'] = 'text-tertiary-500 dark:text-primary-500';
	export let iconSize: PageTitleProps['iconSize'] = '32';
	export let showBackButton: PageTitleProps['showBackButton'] = false;
	export let backUrl: PageTitleProps['backUrl'] = '';

	let calculatedTitle = name;

	// Function to handle back button click
	function handleBackClick() {
		if (backUrl) {
			goto(backUrl);
		} else {
			window.history.back();
		}
	}

	// Function to calculate maximum number of characters based on screen width
	function calculateMaxChars() {
		const containerWidth = window.innerWidth;
		const hamburgerWidth = $sidebarState.left === 'hidden' ? 50 : 0; // Approximate width of the hamburger icon + margins only if sidebar is hidden
		const backButtonWidth = showBackButton ? 60 : 0; // Approximate width of the back button + margins
		const padding = 32; // Approximate padding/margins on both sides
		const availableWidth = containerWidth - (hamburgerWidth + backButtonWidth + padding);

		// Assuming average character width (this is an approximation)
		const avgCharWidth = 8; // You may adjust this based on your font
		const maxChars = Math.floor(availableWidth / avgCharWidth);

		// Truncate the title if it exceeds the maxChars
		calculatedTitle = name.length > maxChars ? name.slice(0, maxChars - 3) + '...' : name;
	}

	onMount(() => {
		calculateMaxChars();
		window.addEventListener('resize', calculateMaxChars);
	});

	$: calculateMaxChars(); // Recalculate when the title or screen size changes
</script>

<div class="my-1 flex w-full items-center justify-between">
	<!-- Left Section: Hamburger and Page Title -->
	<div class="flex items-center">
		<!-- Hamburger Menu -->
		{#if $sidebarState.left === 'hidden'}
			<button
				type="button"
				on:keydown
				on:click={() => toggleSidebar('left', get(screenSize) === 'lg' ? 'full' : 'collapsed')}
				class="variant-ghost-surface btn-icon"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>
		{/if}

		<!-- Page Title with Dynamic Truncation -->
		<h1 class="h1 ml-2 flex items-center gap-1 truncate font-bold">
			<!-- Icon -->
			{#if icon}
				<iconify-icon {icon} width={iconSize} class={`mr-1 ${iconColor} sm:mr-2`} />
			{/if}
			<!-- Title -->
			<span>{calculatedTitle}</span>
		</h1>
	</div>

	<!-- Right Section: Back Button -->
	{#if showBackButton}
		<button on:click={handleBackClick} aria-label="Go back" class="variant-outline-tertiary btn-icon dark:variant-outline-primary">
			<iconify-icon icon="ri:arrow-left-line" width="24" />
		</button>
	{/if}
</div>
