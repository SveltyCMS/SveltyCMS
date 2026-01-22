<!-- 
@file src/components/PageTitle 
@component
**Dynamic Page Title with Accessibility and CMS Features**

@example
<PageTitle 
  name="Dashboard" 
  icon="layout-dashboard" 
  highlight="Dash" 
  iconColor="text-primary-500" 
  iconSize="24" 
  showBackButton={true}  
  backUrl="/home" 
/>

#### Props - Required 
- `name` {string} - Page title
- `icon` {string} - Lucide icon name

#### Props - Optional 
- `highlight` {string} - Part of `name` to highlight
- `iconColor` {string} - Icon color (default: `text-tertiary-500 dark:text-primary-500`)
- `iconSize` {string} - Icon size (default: `32`)
- `showBackButton` {boolean} - Show back button (default: `false`)
- `backUrl` {string} - Navigation URL for back button
- `truncate` {boolean} - Enable title truncation (default: `true`)
- `onBackClick` {function} - Custom back navigation callback
-->
<script lang="ts">
	// Stores
	import { ui } from '@stores/UIStore.svelte.ts';
	import { screen } from '@stores/screenSizeStore.svelte.ts';

	// Icons
	import Menu from '@lucide/svelte/icons/menu';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';

	type DefaultBehaviorFn = () => void;

	// Props
	interface Props {
		name: string;
		highlight?: string;
		icon?: any; // Component type
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
		truncate?: boolean;
		onBackClick?: (defaultBehavior: DefaultBehaviorFn) => void;
		children?: import('svelte').Snippet; // For action buttons
	}

	const {
		name,
		highlight = '',
		icon,
		iconColor = 'text-tertiary-500 dark:text-primary-500',
		iconSize = '32',
		showBackButton = false,
		backUrl = '',
		truncate = true,
		onBackClick,
		children
	}: Props = $props();

	const titleParts = $derived(() => {
		if (highlight && name.toLowerCase().includes(highlight.toLowerCase())) {
			const regex = new RegExp(`(${highlight})`, 'gi');
			return name.split(regex);
		}
		return [name];
	});

	function handleBackClick(event: Event) {
		const defaultBehavior: DefaultBehaviorFn = () => {
			if (!backUrl) {
				event.preventDefault();
				window.history.back();
			}
		};

		if (onBackClick) {
			event.preventDefault();
			onBackClick(defaultBehavior);
		} else if (!backUrl) {
			event.preventDefault();
			window.history.back();
		}
	}
</script>

<div class="my-1.5 flex w-full min-w-0 items-center justify-between gap-4">
	<div class="flex min-w-0 items-center">
		{#if ui.state.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => ui.toggle('leftSidebar', screen.isDesktop ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="preset-outlined-surface-500 btn-icon"
			>
				<Menu size={24} />
			</button>
		{/if}
		<h1
			class="transition-max-width h1 relative ml-2 flex items-center gap-1 font-bold"
			style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);"
			aria-live="polite"
			data-cms-field="pageTitle"
			data-cms-type="text"
		>
			<div class={`mr-1 shrink-0 ${iconColor} sm:mr-2`} aria-hidden="true" style:width="{iconSize}px" style:height="{iconSize}px">
				{#if icon}
					{#if typeof icon === 'string'}
						<iconify-icon {icon} width={iconSize}></iconify-icon>
					{:else}
						{@const IconComponent = icon}
						<IconComponent size={parseInt(iconSize)} />
					{/if}
				{:else}
					<LayoutDashboard size={parseInt(iconSize)} />
				{/if}
			</div>

			<span class:block={truncate} class:overflow-hidden={truncate} class:text-ellipsis={truncate} class:whitespace-nowrap={truncate}>
				{#each titleParts() as part, i (i)}
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

	<div class="flex items-center gap-2">
		{#if children}
			{@render children()}
		{/if}

		{#if showBackButton}
			{#if backUrl}
				<a
					href={backUrl}
					aria-label="Go back"
					class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0"
					data-cms-action="back"
					data-sveltekit-preload-data="hover"
					onclick={(e) => handleBackClick(e)}
				>
					<ArrowLeft size={24} />
				</a>
			{:else}
				<button
					onclick={(e) => handleBackClick(e)}
					aria-label="Go back"
					tabindex="0"
					class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0"
					data-cms-action="back"
				>
					<ArrowLeft size={24} />
				</button>
			{/if}
		{/if}
	</div>
</div>
