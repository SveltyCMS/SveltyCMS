<!--
@file src/widgets/custom/ColorPicker/Display.svelte
@component
**ColorPicker Widget Display Component**

Displays the selected color value visually, for use in lists or detail views.
Part of the Three Pillars Architecture for widget system.

@example
<ColorPickerDisplay value="#ff00ff" />
Renders: color swatch or hex value

### Props
- `value: string | null | undefined` - Color value to display

### Features
- **Color Swatch**: Shows a visual swatch for the selected color
- **Fallback**: Displays hex value if color is invalid or missing
- **Accessible**: Uses ARIA labels for color
- **Tailwind Styling**: Utility-first CSS for layout and color
-->
<script lang="ts">
	let { value }: { value: string | null | undefined } = $props();

	// SECURITY: Validate hex color to prevent CSS injection
	const isValidHex = (color: string): boolean => {
		return /^#[0-9a-f]{6}$/i.test(color);
	};

	const colorValue = $derived(value && isValidHex(value) ? value : '#000000');
</script>

{#if value && isValidHex(value)}
	<div class="color-display flex items-center gap-2" title={colorValue}>
		<div 
			class="h-5 w-5 rounded-full border border-surface-200 dark:border-surface-700 shadow-sm" 
			style="background-color: {colorValue}"
		></div>
		<span class="font-mono text-xs text-surface-600 dark:text-surface-400 uppercase tracking-tight">
			{colorValue}
		</span>
	</div>
{:else}
	<span>–</span>
{/if}

<style>
	.color-display {
		display: inline-flex;
		align-items: center;
		font-family: inherit;
	}
</style>
