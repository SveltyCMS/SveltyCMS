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

	// Stores
	import { toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';

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
		onBackClick
	}: Props = $props();

	let canvas: HTMLCanvasElement;

	function getTextWidth(text: string, fontSize: number): number {
		if (!canvas) return 0;
		const context = canvas.getContext('2d');
		if (!context) return 0;
		context.font = `${fontSize}px sans-serif`;
		return context.measureText(text).width;
	}

	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);

	let calculatedTitle = $derived(() => {
		if (!truncate) return name;
		const containerWidth = windowWidth;
		const hamburgerWidth = uiStateManager.uiState.value.leftSidebar === 'hidden' ? 50 : 0;
		const backButtonWidth = showBackButton ? 60 : 0;
		const iconWidth = icon ? parseInt(iconSize) + 8 : 0;
		const padding = 32;
		const availableWidth = containerWidth - (hamburgerWidth + backButtonWidth + iconWidth + padding);
		const fontSize = 24;
		const textWidth = getTextWidth(name, fontSize);
		if (textWidth === 0) return name;
		const maxChars = Math.floor((availableWidth / textWidth) * name.length);
		return name.length > maxChars ? name.slice(0, maxChars - 3) + '...' : name;
	});

	let titleParts = $derived(() => {
		const currentTitle = calculatedTitle();
		if (highlight && currentTitle.toLowerCase().includes(highlight.toLowerCase())) {
			const regex = new RegExp(`(${highlight})`, 'gi');
			return currentTitle.split(regex);
		}
		return [currentTitle];
	});

	function handleBackClick() {
		const defaultBehavior = () => {
			if (backUrl) goto(backUrl);
			else window.history.back();
		};
		onBackClick ? onBackClick(defaultBehavior) : defaultBehavior();
	}

	// Improved throttle
	function throttle<T extends (...args: any[]) => void>(func: T, limit: number): T {
		let lastCall = 0;
		return function (this: any, ...args: any[]) {
			const now = Date.now();
			if (now - lastCall >= limit) {
				lastCall = now;
				func.apply(this, args);
			}
		} as T;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const resizeHandler = throttle(() => {
			windowWidth = window.innerWidth;
		}, 100);
		window.addEventListener('resize', resizeHandler);
		return () => window.removeEventListener('resize', resizeHandler);
	});
</script>

<canvas bind:this={canvas} width="2000" height="100" style="position: absolute; visibility: hidden;"></canvas>

<div class="my-1 flex w-full items-center justify-between">
	<div class="flex items-center">
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', screenSize() === 'LG' ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="variant-ghost-surface btn-icon"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}
		<h1
			class="transition-max-width h1 relative ml-2 flex items-center gap-1 font-bold"
			style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);"
			aria-live="polite"
			data-cms-field="pageTitle"
			data-cms-type="text"
		>
			{#if icon}
				<iconify-icon {icon} width={iconSize} class={`mr-1 ${iconColor} sm:mr-2`} aria-hidden="true"></iconify-icon>
			{/if}
			<span>
				{#each titleParts() as part, i}
					<span class={i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''}>
						{part}
					</span>
				{/each}
			</span>
			<span class="sr-only absolute inset-0 overflow-hidden whitespace-normal">
				{name}
			</span>
		</h1>
	</div>
	{#if showBackButton}
		<button
			onclick={handleBackClick}
			aria-label="Go back"
			tabindex="0"
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleBackClick()}
			class="variant-outline-tertiary btn-icon dark:variant-outline-primary"
			style="min-width: 48px; min-height: 48px;"
			data-cms-action="back"
		>
			<iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon>
		</button>
	{/if}
</div>
