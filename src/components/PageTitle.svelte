<!-- 
@file src/components/PageTitle.svelte
@description PageTitle component

Functions
@prop {string} name - The name of the page
@prop {string} highlight - The part of the name to be highlighted
@prop {string} icon - The icon of the page
@prop {string} iconColor - The color of the icon
@prop {string} iconSize - The size of the icon
@prop {boolean} showBackButton - Whether to show the back button
@prop {string} backUrl - The URL to go back to
-->
<script lang="ts">
	import { run, createBubbler } from 'svelte/legacy';

	const bubble = createBubbler();
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Stores
	import { get } from 'svelte/store';
	import { sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

	interface PageTitleProps {
		name: string;
		highlight?: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
	}

	interface Props {
		name: PageTitleProps['name'];
		highlight?: PageTitleProps['highlight'];
		icon: PageTitleProps['icon'];
		iconColor?: PageTitleProps['iconColor'];
		iconSize?: PageTitleProps['iconSize'];
		showBackButton?: PageTitleProps['showBackButton'];
		backUrl?: PageTitleProps['backUrl'];
	}

	let {
		name,
		highlight = '',
		icon,
		iconColor = 'text-tertiary-500 dark:text-primary-500',
		iconSize = '32',
		showBackButton = false,
		backUrl = ''
	}: Props = $props();

	let calculatedTitle: string;
	let titleParts: string[] = $state();

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
		updateTitleParts();
	}

	function updateTitleParts() {
		if (highlight && calculatedTitle.toLowerCase().includes(highlight.toLowerCase())) {
			const regex = new RegExp(`(${highlight})`, 'gi');
			titleParts = calculatedTitle.split(regex);
		} else {
			titleParts = [calculatedTitle];
		}
	}

	onMount(() => {
		calculateMaxChars();
		window.addEventListener('resize', calculateMaxChars);
	});

	run(() => {
		name; // reactive dependency
		highlight; // reactive dependency
		calculateMaxChars(); // Recalculate when the title or screen size changes
	});
</script>

<div class="my-1 flex w-full items-center justify-between">
	<!-- Left Section: Hamburger and Page Title -->
	<div class="flex items-center">
		<!-- Hamburger Menu -->
		{#if $sidebarState.left === 'hidden'}
			<button
				type="button"
				onkeydown={bubble('keydown')}
				onclick={() => toggleSidebar('left', get(screenSize) === 'lg' ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="variant-ghost-surface btn-icon"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<!-- Page Title with Dynamic Truncation -->
		<h1 class="h1 ml-2 flex items-center gap-1 truncate font-bold">
			<!-- Icon -->
			{#if icon}
				<iconify-icon {icon} width={iconSize} class={`mr-1 ${iconColor} sm:mr-2`}></iconify-icon>
			{/if}
			<!-- Title -->
			<span>
				{#each titleParts as part, i}
					{#if i % 2 === 1}
						<span class="text-tertiary-500 dark:text-primary-500">{part}</span>
					{:else}
						{part}
					{/if}
				{/each}
			</span>
		</h1>
	</div>

	<!-- Right Section: Back Button -->
	{#if showBackButton}
		<button onclick={handleBackClick} aria-label="Go back" class="variant-outline-tertiary btn-icon dark:variant-outline-primary">
			<iconify-icon icon="ri:arrow-left-line" width="24"></iconify-icon>
		</button>
	{/if}
</div>
