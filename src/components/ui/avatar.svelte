<!--
@file src/components/ui/avatar.svelte
@component
**SveltyCMS Avatar — WCAG 3.0 Ready**

Image avatar with fallback to initials or default icon. Supports loading state tracking
and configurable size/rounded shape.

### Props
- `src` (string): Image source URL.
- `alt` (string): Alt text for the image.
- `initials` (string): Fallback initials when no image loads.
- `size` (string): CSS size class (default: 'size-10').
- `rounded` (string): Border radius class (default: 'rounded-full').
- `class` (string): Additional CSS classes.
- `fallback` (Snippet): Custom fallback content when image fails.

### Features:
- image load state machine (loading → loaded → error)
- automatic fallback to initials or default account icon
- WCAG 3.0 ready with `role="img"` and `aria-label`
- full Svelte 5 runes: $props, $state, $derived, $effect
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type Props = HTMLAttributes<HTMLDivElement> & {
	src?: string;
	alt?: string;
	initials?: string;
	fallback?: Snippet;
	size?: string;
	rounded?: string;
	class?: string;
};

let {
	src,
	alt = '',
	initials,
	fallback,
	size = 'size-8',
	rounded = 'rounded-full',
	class: className,
	...restProps
}: Props = $props();

let status = $state<'loading' | 'loaded' | 'error'>('loading');

$effect(() => {
	const currentSrc = src;
	if (currentSrc) {
		status = 'loading';
		const img = new Image();
		img.src = currentSrc;
		img.onload = () => (status = 'loaded');
		img.onerror = () => (status = 'error');
	} else {
		status = 'error';
	}
});

const classes = $derived(cn(
	'relative flex shrink-0 overflow-hidden',
	size,
	rounded,
	className
));
</script>

<div class={classes} role="img" aria-label={alt || initials || 'Avatar'} {...restProps}>
	{#if status === 'loaded' && src}
		<img src={src} alt={alt} class="aspect-square h-full w-full object-cover" />
	{:else if fallback}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-400 font-medium">
			{@render fallback()}
		</div>
	{:else if initials}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-400 font-medium uppercase">
			{initials}
		</div>
	{:else}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800">
			<iconify-icon icon="mdi:account" class="size-2/3 text-surface-400/50"></iconify-icon>
		</div>
	{/if}
</div>
