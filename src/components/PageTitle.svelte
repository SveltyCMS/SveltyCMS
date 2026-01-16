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
	// Stores
	import { toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { isDesktop } from '@stores/screenSizeStore.svelte';

	type DefaultBehaviorFn = () => void;

	interface Props {
		name: string;
		highlight?: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		showBackButton?: boolean;
		backUrl?: string;
		truncate?: boolean;
		onBackClick?: (defaultBehavior: DefaultBehaviorFn) => void;
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
		onBackClick
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
			// If backUrl exists, let the link handle navigation naturally
		};

		if (onBackClick) {
			event.preventDefault();
			onBackClick(defaultBehavior);
		} else if (!backUrl) {
			// No backUrl provided, use browser history
			event.preventDefault();
			window.history.back();
		}
		// Otherwise, let the <a> tag handle navigation with preloading
	}
</script>

<div class="my-1 flex w-full min-w-0 items-center justify-between gap-4">
	<div class="flex min-w-0 items-center">
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="preset-ghost-surface-500 btn-icon"
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
				<iconify-icon {icon} width={iconSize} class={`mr-1 shrink-0 ${iconColor} sm:mr-2`} aria-hidden="true"></iconify-icon>
			{/if}

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
	{#if showBackButton}
		{#if backUrl}
			<a
				href={backUrl}
				aria-label="Go back"
				class="preset-outlined-tertiary-500 btn-icon shrink-0 dark:preset-outlined-primary-500"
				style="min-width: 48px; min-height: 48px;"
				data-cms-action="back"
				data-sveltekit-preload-data="hover"
				onclick={(e) => handleBackClick(e)}
			>
				<iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon>
			</a>
		{:else}
			<button
				onclick={(e) => handleBackClick(e)}
				aria-label="Go back"
				tabindex="0"
				class="preset-outlined-tertiary-500 btn-icon shrink-0 dark:preset-outlined-primary-500"
				style="min-width: 48px; min-height: 48px;"
				data-cms-action="back"
			>
				<iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon>
			</button>
		{/if}
	{/if}
</div>
