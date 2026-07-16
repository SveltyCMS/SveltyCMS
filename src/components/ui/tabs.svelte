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
  }

  let {
    tabs,
    activeTab = $bindable(""),
    onTabChange = (_id: string) => {},
    variant = "underline",
    ariaLabel = "Navigation tabs",
    testId = "tab-navigation",
  }: {
    tabs: Tab[];
    activeTab?: string;
    onTabChange?: (id: string) => void;
    variant?: "default" | "pills" | "underline";
    ariaLabel?: string;
    testId?: string;
  } = $props();

  function handleTabClick(id: string) {
    activeTab = id;
    onTabChange(id);
  }

  function handleKeyDown(e: KeyboardEvent, index: number) {
    let newIndex = index;
    if (e.key === "ArrowRight") newIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") newIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") newIndex = 0;
    else if (e.key === "End") newIndex = tabs.length - 1;
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
    class="flex gap-1 {variant === 'pills' ? 'p-1 bg-surface-100 dark:bg-surface-800 rounded-xl' : variant === 'underline' ? 'border-b border-surface-200 dark:border-surface-800' : ''} overflow-x-auto"
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
        class="flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all duration-200 {variant === 'pills'
          ? 'rounded-lg ' + (activeTab === tab.id ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300')
          : variant === 'underline'
            ? 'border-b-2 -mb-px ' + (activeTab === tab.id ? 'border-primary-500 text-primary-600 dark:text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:border-surface-300')
            : 'rounded-lg ' + (activeTab === tab.id ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300')
        }"
      >
        {#if tab.icon}
          <iconify-icon icon={tab.icon} width="18" height="18" aria-hidden="true"></iconify-icon>
        {/if}
        <span class="hidden md:inline">{tab.label}</span>
        {#if tab.shortLabel}
          <span class="md:hidden">{tab.shortLabel}</span>
        {/if}
      </Button>
    {/each}
  </div>
</div>
