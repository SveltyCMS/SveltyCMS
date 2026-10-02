<!--
@file src/components/ui/tabs.svelte
@component
**Reusable tab navigation component — uses native `<Button>` for all tabs**

### Props
- `tabs` (Array<{id: string, label: string, icon?: string, shortLabel?: string}>) - Tab definitions
- `activeTab` (string) - Currently active tab ID
- `onTabChange` ((id: string) => void) - Tab selection handler
- `variant` ('default' | 'pills' | 'underline') - Visual style (default: 'underline')
- `ariaLabel` (string) - Accessible label for the tablist (default: 'Navigation tabs')
- `testId` (string) - Data-testid for the root element (default: 'tab-navigation')

### Features
- Keyboard-navigable (Arrow keys, Home, End)
- ARIA-compliant (role="tablist", role="tab", role="tabpanel")
- Native `<Button>` component for consistent theming
- Smooth transitions between tabs
- Responsive: horizontal scroll on mobile
- Support for icons + labels + short labels for mobile
-->

<script lang="ts">
	import Button from './button.svelte';

	interface Tab {
		id: string;
		label: string;
		icon?: string;
		shortLabel?: string;
		/** Step number (1, 2, 3...) */
		step?: number | string;
		/** Show a success checkmark (e.g. completed wizard step). */
		done?: boolean;
	}

	let {
		tabs,
		activeTab = $bindable(''),
		onTabChange = (_id: string) => {},
		variant = 'underline',
		ariaLabel = 'Navigation tabs',
		testId = 'tab-navigation'
	}: {
		tabs: Tab[];
		activeTab?: string;
		onTabChange?: (id: string) => void;
		variant?: 'default' | 'pills' | 'underline';
		ariaLabel?: string;
		testId?: string;
	} = $props();

	function handleTabClick(id: string) {
		activeTab = id;
		onTabChange(id);
	}

	function handleKeyDown(e: KeyboardEvent, index: number) {
		let newIndex = index;
		if (e.key === 'ArrowRight') newIndex = (index + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') newIndex = (index - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') newIndex = 0;
		else if (e.key === 'End') newIndex = tabs.length - 1;
		else return;

		e.preventDefault();
		handleTabClick(tabs[newIndex].id);
		// Focus the new tab button
		const tablist = (e.target as HTMLElement).closest('[role="tablist"]');
		if (tablist) {
			const buttons = tablist.querySelectorAll('[role="tab"]');
			(buttons[newIndex] as HTMLElement)?.focus();
		}
	}
</script>

<div class="w-full" data-testid={testId}>
	<div
		role="tablist"
		aria-label={ariaLabel}
		class="flex gap-2 {variant === 'pills'
			? 'p-1 bg-surface-500/10 dark:bg-surface-800 rounded-xl'
			: ''} overflow-x-auto overflow-y-clip"
	>
		{#each tabs as tab, i (tab.id)}
			<Button
				variant="ghost"
				role="tab"
				aria-selected={activeTab === tab.id}
				aria-controls="tabpanel-{tab.id}"
				tabindex={activeTab === tab.id ? 0 : -1}
				onclick={() => handleTabClick(tab.id)}
				onkeydown={(e: KeyboardEvent) => handleKeyDown(e, i)}
				data-testid="tab-{tab.id}"
				class="flex items-center gap-2.5 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all duration-200 {variant ===
				'pills'
					? 'rounded-lg! ' +
						(activeTab === tab.id
							? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100'
							: 'text-surface-500 hover:text-surface-600 dark:hover:text-surface-400')
					: variant === 'underline'
						? 'rounded-none! border-b-2 ' +
							(activeTab === tab.id
								? 'border-tertiary-500 text-tertiary-600 dark:border-primary-500 dark:text-primary-500'
								: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400 hover:border-surface-500/30')
						: 'rounded-lg! ' +
							(activeTab === tab.id
								? 'bg-tertiary-500/10 text-tertiary-600 dark:bg-primary-900/20 dark:text-primary-400'
								: 'text-surface-500 hover:text-surface-600 dark:hover:text-surface-400')}"
			>
				{#if tab.step !== undefined}
					<span
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all {activeTab ===
						tab.id
							? 'bg-tertiary-500 text-white dark:bg-primary-500 shadow-2xs'
							: tab.done
								? 'bg-success-500/20 text-success-600 dark:text-success-400'
								: 'bg-surface-500/20 text-surface-600 dark:text-surface-400'}"
					>
						{tab.step}
					</span>
				{/if}
				{#if tab.icon}
					<iconify-icon icon={tab.icon} width="18" height="18" aria-hidden="true"></iconify-icon>
				{/if}
				<span class="hidden md:inline">{tab.label}</span>
				{#if tab.shortLabel}
					<span class="md:hidden">{tab.shortLabel}</span>
				{/if}
				{#if tab.done}
					<iconify-icon
						icon="mdi:check-circle"
						width="16"
						class="text-success-500"
						aria-hidden="true"
					></iconify-icon>
				{/if}
			</Button>
		{/each}
	</div>
</div>
