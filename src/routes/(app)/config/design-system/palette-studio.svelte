<!--
@file src/routes/(app)/config/design-system/palette-studio.svelte
@component
**Palette Studio — brand color editor**

Pick core seed colors, expand to shade scales via theme-preset-mapper, live-apply
into theme customCss (marked block), and preview on native components.

### Props
- `customCss` (bindable): Theme custom CSS; palette block is merged in place
- `onApplied` (optional): Callback after applying so parent can mark dirty / toast

### Features:
- primary / tertiary / surface (core) + optional secondary & status colors
- live apply toggle (default on)
- swatch preview of expanded shades
- does not wipe manual Advanced CSS outside palette markers
-->

<script lang="ts">
	import AdminCard from "@components/admin-card.svelte";
	import Button from "@components/ui/button.svelte";
	import Input from "@components/ui/input.svelte";
	import Toggle from "@components/ui/toggle.svelte";
	import {
		buildPaletteCssFromSeeds,
		DEFAULT_PALETTE_SEEDS,
		expandShorthandPaletteProperties,
		isValidPaletteHex,
		mergePaletteCssIntoCustomCss,
		type PaletteSeedKey,
		type PaletteSeeds,
	} from "@utils/theme-preset-mapper";

	interface Props {
		customCss?: string;
		onApplied?: (css: string) => void;
		onOpenPreview?: () => void;
	}

	let { customCss = $bindable(""), onApplied, onOpenPreview }: Props = $props();

	const CORE_KEYS: { key: PaletteSeedKey; label: string; hint: string }[] = [
		{ key: "primary", label: "Primary", hint: "Brand accent (dark mode emphasis)" },
		{ key: "tertiary", label: "Tertiary", hint: "Light-mode accent / links" },
		{ key: "surface", label: "Surface", hint: "Page & card canvas" },
	];

	const EXTRA_KEYS: { key: PaletteSeedKey; label: string }[] = [
		{ key: "secondary", label: "Secondary" },
		{ key: "success", label: "Success" },
		{ key: "warning", label: "Warning" },
		{ key: "error", label: "Error" },
	];

	const SWATCH_SHADES = ["50", "500", "950"] as const;

	let seeds = $state<Required<typeof DEFAULT_PALETTE_SEEDS>>({ ...DEFAULT_PALETTE_SEEDS });
	let showExtras = $state(false);
	let liveApply = $state(true);
	let applyError = $state<string | null>(null);

	const seedRecord = $derived.by((): PaletteSeeds => {
		const out: PaletteSeeds = {
			primary: seeds.primary,
			tertiary: seeds.tertiary,
			surface: seeds.surface,
		};
		if (showExtras) {
			out.secondary = seeds.secondary;
			out.success = seeds.success;
			out.warning = seeds.warning;
			out.error = seeds.error;
		}
		return out;
	});

	const expandedLonghand = $derived(expandShorthandPaletteProperties(seedRecord as Record<string, string>));

	const palettePreviewCss = $derived(buildPaletteCssFromSeeds(seedRecord));

	function applyPalette() {
		applyError = null;
		for (const [k, v] of Object.entries(seedRecord)) {
			if (v && !isValidPaletteHex(v)) {
				applyError = `Invalid hex for ${k}: use #RGB or #RRGGBB`;
				return;
			}
		}
		if (!palettePreviewCss) {
			applyError = "Add at least one valid hex color";
			return;
		}
		const next = mergePaletteCssIntoCustomCss(customCss, palettePreviewCss);
		customCss = next;
		onApplied?.(next);
	}

	function resetSeeds() {
		seeds = { ...DEFAULT_PALETTE_SEEDS };
		if (liveApply) applyPalette();
	}

	function clearPaletteBlock() {
		customCss = mergePaletteCssIntoCustomCss(customCss, "");
		onApplied?.(customCss);
	}

	// Live-apply when seeds change (debounced via microtask batching of $effect)
	let skipFirstLive = true;
	$effect(() => {
		// track seeds
		void seeds.primary;
		void seeds.tertiary;
		void seeds.surface;
		void seeds.secondary;
		void seeds.success;
		void seeds.warning;
		void seeds.error;
		void showExtras;
		void liveApply;
		if (!liveApply) return;
		if (skipFirstLive) {
			skipFirstLive = false;
			return;
		}
		applyPalette();
	});
</script>

<AdminCard class="p-5 space-y-4" data-testid="palette-studio">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h3 class="text-base font-bold flex items-center gap-2" style="color: var(--admin-text-body)">
				<iconify-icon icon="mdi:palette" class="text-tertiary-500 dark:text-primary-500" width="22"></iconify-icon>
				Palette studio
			</h3>
			<p class="text-sm mt-1" style="color: var(--admin-text-muted)">
				Pick brand seeds. Shades expand automatically and apply as runtime CSS — no need to edit
				<code class="text-xs">app.css</code>.
			</p>
		</div>
		<div class="flex flex-col items-end gap-2">
			<Toggle bind:value={liveApply} label="Live apply" />
			<Toggle bind:value={showExtras} label="More colors" />
		</div>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		{#each CORE_KEYS as row (row.key)}
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-2 text-sm font-medium" style="color: var(--admin-text-body)">
					<label for={`palette-color-${row.key}`}>{row.label}</label>
					<!-- attrs on same line: slop-scanner only reads the opening tag line -->
					<input id={`palette-color-${row.key}`} type="color" aria-label={`${row.label} color`} title={`${row.label} color`} class="h-9 w-12 cursor-pointer rounded border border-surface-500/30 dark:border-surface-600 bg-transparent p-0.5" value={seeds[row.key]} oninput={(e) => { seeds[row.key] = (e.currentTarget as HTMLInputElement).value; }} />
				</div>
				<Input
					id={`palette-hex-${row.key}`}
					bind:value={seeds[row.key]}
					label={`${row.label} hex`}
					placeholder="#0f766e"
					class="font-mono text-xs"
				/>
				<p class="text-[11px]" style="color: var(--admin-text-muted)">{row.hint}</p>
			</div>
		{/each}
	</div>

	{#if showExtras}
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t" style="border-color: var(--admin-border-default)">
			{#each EXTRA_KEYS as row (row.key)}
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2 text-sm font-medium" style="color: var(--admin-text-body)">
						<label for={`palette-color-${row.key}`}>{row.label}</label>
						<input id={`palette-color-${row.key}`} type="color" aria-label={`${row.label} color`} title={`${row.label} color`} class="h-8 w-10 cursor-pointer rounded border border-surface-500/30 dark:border-surface-600 bg-transparent p-0.5" value={seeds[row.key]} oninput={(e) => { seeds[row.key] = (e.currentTarget as HTMLInputElement).value; }} />
					</div>
					<Input
						id={`palette-hex-${row.key}`}
						bind:value={seeds[row.key]}
						label={`${row.label} hex`}
						class="font-mono text-xs"
					/>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Expanded swatches -->
	<div class="space-y-3">
		<h4 class="text-xs font-bold uppercase tracking-wider" style="color: var(--admin-text-muted)">Expanded shades</h4>
		<div class="space-y-2">
			{#each Object.keys(seedRecord) as paletteKey (paletteKey)}
				<div class="flex flex-wrap items-center gap-2">
					<span class="w-20 text-xs font-semibold capitalize" style="color: var(--admin-text-body)">{paletteKey}</span>
					{#each SWATCH_SHADES as shade (shade)}
						{@const varName = `--color-${paletteKey}-${shade}`}
						{@const val = expandedLonghand[varName]}
						{#if val}
							<div class="flex flex-col items-center gap-0.5" title="{varName}: {val}">
								<div
									class="h-8 w-12 rounded-md border"
									style="background: {val}; border-color: var(--admin-border-default)"
								></div>
								<span class="text-[10px]" style="color: var(--admin-text-muted)">{shade}</span>
							</div>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	</div>

	{#if applyError}
		<p class="text-sm text-error-600 dark:text-error-400" role="alert">{applyError}</p>
	{/if}

	<div class="flex flex-wrap gap-2 pt-1">
		<Button variant="primary" size="sm" onclick={applyPalette} data-testid="palette-studio-apply">
			Apply palette
		</Button>
		<Button variant="outline" size="sm" onclick={resetSeeds} data-testid="palette-studio-reset">
			Reset to Corporate defaults
		</Button>
		<Button variant="ghost" size="sm" onclick={clearPaletteBlock} data-testid="palette-studio-clear">
			Clear palette block
		</Button>
		{#if onOpenPreview}
			<Button variant="ghost" size="sm" onclick={onOpenPreview} data-testid="palette-studio-preview">
				Open Live Preview
			</Button>
		{/if}
	</div>
	<p class="text-[11px]" style="color: var(--admin-text-muted)">
		Applied CSS is stored in the theme’s custom CSS (Advanced tab) between
		<code class="text-[10px]">sveltycms-palette-start/end</code> markers. Click <strong>Save Theme</strong> to
		persist.
	</p>
</AdminCard>
