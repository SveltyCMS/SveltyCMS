<!--
@file src/routes/(app)/config/design-system/+page.svelte
@component
**Design System Playground — interactive native UI catalog**

Live-preview density, variant, and structural tokens. Browse Buttons, Badges,
Inputs, Cards, and semantic color palettes without Storybook.

### Features:
- live AdminTheme context preview
- semantic color swatches
- native component matrix
- structural --admin-* token readout
-->

<script lang="ts">
  import AdminPageShell from "@components/admin-page-shell.svelte";
  import AdminCard from "@components/admin-card.svelte";
  import Badge from "@components/ui/badge.svelte";
  import Button from "@components/ui/button.svelte";
  import Input from "@components/ui/input.svelte";
  import Select from "@components/ui/select.svelte";
  import Textarea from "@components/ui/textarea.svelte";
  import Toggle from "@components/ui/toggle.svelte";
  import ThemeToggle from "@components/theme-toggle.svelte";
  import { untrack } from "svelte";
  import { getThemeContext } from "@components/ui/theme-context.svelte";
  import type { AdminTheme } from "@components/ui/theme-context.svelte";

  const PALETTES = ["primary", "secondary", "tertiary", "success", "warning", "error", "surface"] as const;
  const KEY_SHADES = ["50", "500", "950"] as const;

  const BUTTON_VARIANTS = [
    "primary",
    "secondary",
    "tertiary",
    "surface",
    "success",
    "warning",
    "error",
    "ghost",
    "outline",
  ] as const;

  const densityOptions = [
    { value: "compact", label: "Compact" },
    { value: "cozy", label: "Cozy" },
    { value: "spacious", label: "Spacious" },
  ];

  const variantOptions = [
    { value: "flat", label: "Flat" },
    { value: "bordered", label: "Bordered" },
    { value: "elevated", label: "Elevated" },
  ];

  const selectOptions = [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "scheduled", label: "Scheduled" },
  ];

  let { data } = $props();
  const liveTheme = getThemeContext() as AdminTheme | undefined;

  let previewDensity = $state<"compact" | "cozy" | "spacious">(
    untrack(() => (data.adminTheme?.density as "compact" | "cozy" | "spacious") || "cozy"),
  );
  let previewVariant = $state<"flat" | "bordered" | "elevated">(
    untrack(() => (data.adminTheme?.variant as "flat" | "bordered" | "elevated") || "bordered"),
  );
  let sampleInput = $state("Sample value");
  let sampleSelect = $state("draft");
  let sampleToggle = $state(true);
  let sampleTextarea = $state("Helper text and labels adapt to density.");

  const structuralTokens = $derived(
    liveTheme
      ? [
          { label: "Sidebar width", value: liveTheme.sidebarWidth },
          { label: "Header height", value: liveTheme.headerHeight },
          { label: "Sticky bar height", value: liveTheme.stickyBarHeight },
          { label: "Card radius", value: liveTheme.radiusCard },
          { label: "Input radius", value: liveTheme.radiusInput },
          { label: "Button radius", value: liveTheme.radiusButton },
          { label: "Density scale", value: String(liveTheme.densityScale) },
          { label: "Card shadow", value: liveTheme.cardShadow },
        ]
      : [],
  );

  $effect(() => {
    if (!liveTheme) return;
    liveTheme.density = previewDensity;
    liveTheme.variant = previewVariant;
  });
</script>

<AdminPageShell
	  title="Design System"
	  icon="mdi:compass-outline"
	  description="Interactive catalog of native admin components and theme tokens. Changes here preview locally — save presets in Appearance."
	  showBackButton={true}
	  backUrl="/config"
	>
  <div class="space-y-6">
    <!-- Controls -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-4 flex items-center gap-2">
        <iconify-icon icon="mdi:tune-vertical" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
        Playground controls
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <Select
          label="Density"
          bind:value={previewDensity}
          options={densityOptions}
        />
        <Select
          label="Card variant"
          bind:value={previewVariant}
          options={variantOptions}
        />
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Color mode</span>
          <ThemeToggle showTooltip={false} buttonClass="preset-outline-surface-500 btn-icon" />
        </div>
        <div class="flex gap-2">
          <Button variant="outline" href="/config/appearance" leadingIcon="mdi:palette-outline">
            Appearance
          </Button>
        </div>
      </div>
    </AdminCard>

    <!-- Color tokens -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-1">Semantic palettes</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
        Tailwind utilities map to <code class="text-xs">--color-&#123;palette&#125;-&#123;shade&#125;</code> tokens.
        Override at runtime via Appearance or <code class="text-xs">/themes/*.json</code>.
      </p>
      <div class="space-y-4">
        {#each PALETTES as palette (palette)}
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">{palette}</div>
            <div class="flex flex-wrap gap-2">
              {#each KEY_SHADES as shade (shade)}
                <div class="flex flex-col items-center gap-1">
                  <div
                    class="h-10 w-16 rounded-md border border-surface-200 dark:border-surface-700"
                    style="background-color: var(--color-{palette}-{shade})"
                    title="{palette}-{shade}"
                  ></div>
                  <span class="text-[10px] text-surface-400">{shade}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </AdminCard>

    <!-- Buttons -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-4">Buttons</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each BUTTON_VARIANTS as variant (variant)}
          <Button {variant} size="md">{variant}</Button>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="md">Medium</Button>
        <Button variant="primary" size="lg">Large</Button>
        <Button variant="primary" loading>Loading</Button>
        <Button variant="primary" leadingIcon="mdi:content-save">With icon</Button>
      </div>
    </AdminCard>

    <!-- Badges -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-4">Badges</h2>
      <div class="flex flex-wrap gap-2">
        <Badge variant="primary" preset="filled">Filled</Badge>
        <Badge variant="tertiary" preset="tonal">Tonal</Badge>
        <Badge variant="success" preset="outlined">Outlined</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="error">Error</Badge>
        <Badge variant="surface">Surface</Badge>
      </div>
    </AdminCard>

    <!-- Forms -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-4">Form controls</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <Input bind:value={sampleInput} label="Text input" placeholder="Enter text" />
        <Select bind:value={sampleSelect} label="Select" options={selectOptions} />
        <Textarea bind:value={sampleTextarea} label="Textarea" rows={3} />
        <Toggle bind:value={sampleToggle} label="Toggle feature" />
        <Input
          value="Invalid state"
          label="Error state"
          error="This field is required"
          disabled
        />
      </div>
    </AdminCard>

    <!-- Cards -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-4">Cards</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminCard class="p-4">
          <p class="text-sm font-medium text-surface-900 dark:text-white">AdminCard shell</p>
          <p class="text-xs text-surface-500 mt-1">Uses --admin-radius-card and theme shadows.</p>
        </AdminCard>
        <AdminCard class="p-4" variant="tertiary" preset="tonal">
          <p class="text-sm font-medium">Tonal Card</p>
          <p class="text-xs text-surface-500 mt-1">Via Card preset passthrough.</p>
        </AdminCard>
        <AdminCard class="p-4" variant="primary" preset="outlined">
          <p class="text-sm font-medium">Outlined Card</p>
          <p class="text-xs text-surface-500 mt-1">Border + subtle fill.</p>
        </AdminCard>
      </div>
    </AdminCard>

    <!-- Structural tokens -->
    <AdminCard class="p-5">
      <h2 class="text-base font-bold text-surface-900 dark:text-white mb-1">Structural tokens</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
        <code class="text-xs">--admin-*</code> values from the active AdminTheme context (density: {previewDensity}, variant: {previewVariant}).
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-surface-200 dark:border-surface-800 text-start text-xs uppercase tracking-wider text-surface-400">
              <th class="pb-3 font-semibold pe-4">Token</th>
              <th class="pb-3 font-semibold">Resolved value</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
            {#each structuralTokens as row (row.label)}
              <tr class="text-surface-700 dark:text-surface-200">
                <td class="py-2 pe-4 font-medium">{row.label}</td>
                <td class="py-2 font-mono text-xs text-surface-500">{row.value}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </AdminCard>

    {#if data.isAdmin}
      <p class="text-xs text-surface-400 text-center pb-4">
        Contributing? See
        <a href="https://docs.sveltycms.com" target="_blank" rel="noopener" class="text-tertiary-500 dark:text-primary-500 underline">style-guide-gui.mdx</a>
        in the repo docs.
      </p>
    {/if}
  </div>
</AdminPageShell>
