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

	const safeColor = $derived(value && isValidHex(value) ? value : '#000000');
</script>

{#if value && isValidHex(value)}
	<div class="display-wrapper" title={value}>
		<div class="swatch-preview" style:background-color={safeColor}></div>
		<span class="hex-code">{value}</span>
	</div>
{:else}
	<span>–</span>
{/if}

<style>
	.display-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch-preview {
		width: 1rem;
		height: 1rem;
		border-radius: 2px;
		border: 1px solid #ccc;
		flex-shrink: 0;
	}
	.hex-code {
		font-family: monospace;
		font-size: 0.875rem;
	}
</style>
