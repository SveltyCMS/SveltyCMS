<!--
@file src/routes/(app)/config/design-system/design-system-preview.svelte
@component
**Design System Preview — native UI catalog for Appearance**

Interactive catalog of Buttons, Badges, Inputs, Cards, semantic palettes, and
structural --admin-* tokens. Density/variant bind to the parent Appearance form
so preview stays in sync with Layout & Visual Style tabs.

### Props
- `density` (bindable): compact | cozy | spacious
- `variant` (bindable): flat | bordered | elevated
- `showAppearanceLink` (boolean): Show deep-link back to Appearance (standalone use)

### Features:
- live AdminTheme context preview
- semantic color swatches including --admin-bg-* roles
- native component matrix
-->

<script lang="ts">
	import AdminCard from "@components/admin-card.svelte";
	import Badge from "@components/ui/badge.svelte";
	import Button from "@components/ui/button.svelte";
	import Input from "@components/ui/input.svelte";
	import Select from "@components/ui/select.svelte";
	import Textarea from "@components/ui/textarea.svelte";
	import Toggle from "@components/ui/toggle.svelte";
	import ThemeToggle from "@components/theme-toggle.svelte";
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

	interface Props {
		density?: "compact" | "cozy" | "spacious";
		variant?: "flat" | "bordered" | "elevated";
		showAppearanceLink?: boolean;
	}

	let {
		density = $bindable<"compact" | "cozy" | "spacious">("cozy"),
		variant = $bindable<"flat" | "bordered" | "elevated">("bordered"),
		showAppearanceLink = false,
	}: Props = $props();

	const liveTheme = getThemeContext() as AdminTheme | undefined;

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
					{ label: "Card border", value: liveTheme.cardBorder },
				]
			: [],
	);

	const semanticRoles = [
		{ label: "Page", varName: "--admin-bg-page" },
		{ label: "Card", varName: "--admin-bg-card" },
		{ label: "Sidebar", varName: "--admin-bg-sidebar" },
		{ label: "Border", varName: "--admin-border-default" },
		{ label: "Subtle border", varName: "--admin-border-subtle" },
		{ label: "Body text", varName: "--admin-text-body" },
		{ label: "Muted text", varName: "--admin-text-muted" },
	] as const;

	$effect(() => {
		if (!liveTheme) return;
		liveTheme.density = density;
		liveTheme.variant = variant;
	});
</script>

<div class="space-y-6" data-testid="design-system-preview">
	<!-- Controls -->
	<AdminCard class="p-5">
		<h2 class="mb-4 flex items-center gap-2 text-base font-bold" style="color: var(--admin-text-body)">
			<iconify-icon icon="mdi:tune-vertical" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			Playground controls
		</h2>
		<div class="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Select label="Density" bind:value={density} options={densityOptions} />
			<Select label="Card variant" bind:value={variant} options={variantOptions} />
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium" style="color: var(--admin-text-body)">Color mode</span>
				<ThemeToggle showTooltip={false} buttonClass="preset-outline-surface-500 btn-icon" />
			</div>
			{#if showAppearanceLink}
				<div class="flex gap-2">
					<Button variant="outline" href="/config/design-system?tab=style" leadingIcon="mdi:palette-outline">
						Appearance
					</Button>
				</div>
			{/if}
		</div>
	</AdminCard>

	<!-- Semantic surface roles -->
	<AdminCard class="p-5">
		<h2 class="mb-1 text-base font-bold" style="color: var(--admin-text-body)">Admin surface roles</h2>
		<p class="mb-4 text-sm" style="color: var(--admin-text-muted)">
			Semantic <code class="text-xs">--admin-*</code> roles for page/card elevation. Shadows still follow card
			variant (flat / bordered / elevated).
		</p>
		<div class="flex flex-wrap gap-3">
			{#each semanticRoles as role (role.varName)}
				<div class="flex flex-col items-center gap-1">
					<div
						class="h-10 w-16 rounded-md border"
						style="background-color: var({role.varName}); border-color: var(--admin-border-default)"
						title={role.varName}
					></div>
					<span class="text-[10px]" style="color: var(--admin-text-muted)">{role.label}</span>
				</div>
			{/each}
		</div>
	</AdminCard>

	<!-- Color tokens -->
	<AdminCard class="p-5">
		<h2 class="mb-1 text-base font-bold" style="color: var(--admin-text-body)">Semantic palettes</h2>
		<p class="mb-4 text-sm" style="color: var(--admin-text-muted)">
			Tailwind utilities map to <code class="text-xs">--color-{"{palette}"}-{"{shade}"}</code> tokens. Override at
			runtime via Appearance or <code class="text-xs">/themes/*.json</code>.
		</p>
		<div class="space-y-4">
			{#each PALETTES as palette (palette)}
				<div>
					<div class="mb-2 text-xs font-semibold uppercase tracking-wider" style="color: var(--admin-text-muted)">
						{palette}
					</div>
					<div class="flex flex-wrap gap-2">
						{#each KEY_SHADES as shade (shade)}
							<div class="flex flex-col items-center gap-1">
								<div
									class="h-10 w-16 rounded-md border"
									style="background-color: var(--color-{palette}-{shade}); border-color: var(--admin-border-default)"
									title="{palette}-{shade}"
								></div>
								<span class="text-[10px]" style="color: var(--admin-text-muted)">{shade}</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</AdminCard>

	<!-- Buttons -->
	<AdminCard class="p-5">
		<h2 class="mb-4 text-base font-bold" style="color: var(--admin-text-body)">Buttons</h2>
		<div class="mb-4 flex flex-wrap gap-2">
			{#each BUTTON_VARIANTS as btnVariant (btnVariant)}
				<Button variant={btnVariant} size="md">{btnVariant}</Button>
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
		<h2 class="mb-4 text-base font-bold" style="color: var(--admin-text-body)">Badges</h2>
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
		<h2 class="mb-4 text-base font-bold" style="color: var(--admin-text-body)">Form controls</h2>
		<div class="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
			<Input bind:value={sampleInput} label="Text input" placeholder="Enter text" />
			<Select bind:value={sampleSelect} label="Select" options={selectOptions} />
			<Textarea bind:value={sampleTextarea} label="Textarea" rows={3} />
			<Toggle bind:value={sampleToggle} label="Toggle feature" />
			<Input value="Invalid state" label="Error state" error="This field is required" disabled />
		</div>
	</AdminCard>

	<!-- Cards -->
	<AdminCard class="p-5">
		<h2 class="mb-4 text-base font-bold" style="color: var(--admin-text-body)">Cards</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<AdminCard class="p-4">
				<p class="text-sm font-medium" style="color: var(--admin-text-body)">AdminCard shell</p>
				<p class="mt-1 text-xs" style="color: var(--admin-text-muted)">
					Uses --admin-bg-card, --admin-radius-card, and theme shadows.
				</p>
			</AdminCard>
			<AdminCard class="p-4" variant="tertiary" preset="tonal">
				<p class="text-sm font-medium">Tonal Card</p>
				<p class="mt-1 text-xs" style="color: var(--admin-text-muted)">Via Card preset passthrough.</p>
			</AdminCard>
			<AdminCard class="p-4" variant="primary" preset="outlined">
				<p class="text-sm font-medium">Outlined Card</p>
				<p class="mt-1 text-xs" style="color: var(--admin-text-muted)">Border + subtle fill.</p>
			</AdminCard>
		</div>
	</AdminCard>

	<!-- Structural tokens -->
	<AdminCard class="p-5">
		<h2 class="mb-1 text-base font-bold" style="color: var(--admin-text-body)">Structural tokens</h2>
		<p class="mb-4 text-sm" style="color: var(--admin-text-muted)">
			<code class="text-xs">--admin-*</code> values from AdminTheme (density: {density}, variant: {variant}).
		</p>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b text-start text-xs uppercase tracking-wider" style="border-color: var(--admin-border-default); color: var(--admin-text-muted)">
						<th class="pb-3 pe-4 font-semibold">Token</th>
						<th class="pb-3 font-semibold">Resolved value</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="--tw-divide-opacity: 1; border-color: var(--admin-border-subtle)">
					{#each structuralTokens as row (row.label)}
						<tr style="color: var(--admin-text-body)">
							<td class="py-2 pe-4 font-medium">{row.label}</td>
							<td class="py-2 font-mono text-xs" style="color: var(--admin-text-muted)">{row.value}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>
