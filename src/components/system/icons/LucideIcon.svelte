<script lang="ts">
	/**
	 * @file src/components/system/icons/LucideIcon.svelte
	 * @component Generic Lucide Icon renderer that avoids importing the entire library.
	 * It uses pre-processed icon data (iconNode) to render SVG.
	 */
	interface Props {
		iconNode?: any[];
		size?: number | string;
		color?: string;
		strokeWidth?: number | string;
		absoluteStrokeWidth?: boolean;
		name?: string;
		class?: string;
		[key: string]: any;
	}

	let {
		iconNode = [],
		size = 24,
		color = 'currentColor',
		strokeWidth = 2,
		absoluteStrokeWidth = false,
		name = '',
		class: className = '',
		...props
	}: Props = $props();

	// Calculate stroke width based on absoluteStrokeWidth (matching Lucide behavior)
	const strokeWidthToUse = $derived(absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth);
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width={strokeWidthToUse}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={['lucide-icon', 'lucide', name ? `lucide-${name}` : '', className].join(' ').trim()}
	{...props}
>
	{#each iconNode as [tag, attrs]}
		<svelte:element this={tag} {...attrs} />
	{/each}
</svg>
