<!-- 
@file src/components/PageTitle.svelte 
@component
**Dynamic Page Title with Accessibility and CMS Features**

@example
<PageTitle 
  name="Dashboard" 
  icon="bi:bar-chart-line" 
  highlight="Dash" 
  iconColor="text-primary-500" 
  iconSize="24" 
  showBackButton={true}  
  backUrl="/home" 
  onBackClick={(defaultBehavior) => {
    // Custom navigation logic
    defaultBehavior();
  }}
/>

#### Props - Required 
- `name` {string} - Page title
- `icon` {string} - Icon name from [iconify](https://iconify.design/)

#### Props - Optional 
- `highlight` {string} - Part of `name` to highlight
- `iconColor` {string} - Icon color (default: `text-tertiary-500 dark:text-primary-500`)
- `iconSize` {string} - Icon size (default: `32`)
- `showBackButton` {boolean} - Show back button (default: `false`)
- `backUrl` {string} - Navigation URL for back button
- `truncate` {boolean} - Enable title truncation (default: `true`)
- `onBackClick` {function} - Custom back navigation callback
- `color` {string} - Background/text color (default: `blue`)

#### Accessibility Features:
- ARIA live region for title changes
- Keyboard navigation support
- Screen reader optimization with visually hidden full title
- Contrast validation for highlighted text
- Responsive touch targets

#### CMS Features:
- Data attributes for CMS field mapping
- Content editor hints
- Fluid typography scaling
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { sidebarState, toggleSidebar } from '@root/src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

	interface Props {
		name: string;
		highlight?: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
		truncate?: boolean;
		onBackClick?: (defaultBehavior: () => void) => void;
	}

	let {
		name,
		highlight = '',
		icon,
		iconColor = 'text-tertiary-500 dark:text-primary-500',
		iconSize = '32',
		showBackButton = false,
		backUrl = '',
		truncate = true,
		onBackClick = undefined
	}: Props = $props();

	// Text measurement canvas
	let canvas: HTMLCanvasElement;
	let canvasReady = $state(false);

	// Handle SSR and canvas initialization
	$effect(() => {
		if (typeof window !== 'undefined' && canvas) {
			canvasReady = true;
		}
	});

	function getTextWidth(text: string, fontSize: number): number {
		if (!canvasReady) return 0;
		const context = canvas.getContext('2d');
		if (!context) return 0;
		context.font = `${fontSize}px sans-serif`;
		return context.measureText(text).width;
	}

	// Track window width for reactivity
	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);

	// Derived values for dynamic truncation
	let calculatedTitle = $derived(() => {
		if (!truncate) return name;

		const containerWidth = windowWidth;
		const hamburgerWidth = sidebarState.sidebar.value.left === 'hidden' ? 50 : 0;
		const backButtonWidth = showBackButton ? 60 : 0;
		const iconWidth = icon ? parseInt(iconSize) + 8 : 0;
		const padding = 32;
		const availableWidth = containerWidth - (hamburgerWidth + backButtonWidth + iconWidth + padding);

		const fontSize = 24;
		const textWidth = getTextWidth(name, fontSize);

		if (textWidth === 0) return name; // Fallback if canvas not ready

		const maxChars = Math.floor((availableWidth / textWidth) * name.length);
		return name.length > maxChars ? name.slice(0, maxChars - 3) + '...' : name;
	});

	let titleParts = $derived(() => {
		const currentTitle = calculatedTitle(); // Get the value
		if (highlight && currentTitle.toLowerCase().includes(highlight.toLowerCase())) {
			const regex = new RegExp(`(${highlight})`, 'gi');
			return currentTitle.split(regex);
		}
		return [currentTitle];
	});

	// Back button handler
	function handleBackClick() {
		const defaultBehavior = () => {
			if (backUrl) {
				goto(backUrl);
			} else {
				window.history.back();
			}
		};

		if (onBackClick) {
			onBackClick(defaultBehavior);
		} else {
			defaultBehavior();
		}
	}

	// Simple throttle function
	function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
		let inThrottle: boolean;
		let lastResult: ReturnType<T>;
		return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
			if (!inThrottle) {
				inThrottle = true;
				setTimeout(() => (inThrottle = false), limit);
				lastResult = func.apply(this, args);
			}
			return lastResult;
		} as T;
	}

	// Throttled resize handler using the simple throttle
	$effect(() => {
		if (typeof window === 'undefined') return;

		const resizeHandler = throttle(() => {
			windowWidth = window.innerWidth;
		}, 100); // Throttle to 100ms

		window.addEventListener('resize', resizeHandler);
		return () => window.removeEventListener('resize', resizeHandler);
	});
</script>

<!-- Hidden canvas for text measurement -->
<canvas bind:this={canvas} width="2000" height="100" style="position: absolute; visibility: hidden;"></canvas>

<!-- Main component layout -->
<div class="my-1 flex w-full items-center justify-between">
	<!-- Left section with hamburger and title -->
	<div class="flex items-center">
		{#if sidebarState.sidebar.value.left === 'hidden'}
			<button
				type="button"
				onclick={() => toggleSidebar('left', screenSize() === 'lg' ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="preset-tonal-surface border-surface-500 btn-icon border"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<h1
			class="h1 transition-max-width relative ml-2 flex items-center gap-1 font-bold"
			style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);"
			aria-live="polite"
			data-cms-field="pageTitle"
			data-cms-type="text"
		>
			{#if icon}
				<iconify-icon {icon} width={iconSize} class={`mr-1 ${iconColor} sm:mr-2`} aria-hidden="true"></iconify-icon>
			{/if}

			<!-- Visible truncated title -->
			<span class:truncate>
				{#each titleParts() as part, i}
					<span class={i % 2 === 1 ? 'text-tertiary-500 dark:text-primary-500' : ''} style={i % 2 === 1 ? 'font-weight: 600;' : ''}>
						{part}
					</span>
				{/each}
			</span>

			<!-- Full title for SEO/screen readers -->
			<span class="sr-only absolute inset-0 overflow-hidden whitespace-normal">
				{name}
			</span>
		</h1>
	</div>

	<!-- Back button -->
	{#if showBackButton}
		<button
			onclick={handleBackClick}
			aria-label="Go back"
			tabindex="0"
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleBackClick()}
			class="preset-outline-tertiary btn-icon dark:preset-outline-primary"
			style="min-width: 48px; min-height: 48px;"
			data-cms-action="back"
		>
			<iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon>
		</button>
	{/if}
</div>
