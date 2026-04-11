<!-- 
 @src/routes/api/cms.ts src/components/ui/avatar.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Avatar Primitive
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

let props: Props = $props();

let status = $state<'loading' | 'loaded' | 'error'>('loading');

$effect(() => {
	const currentSrc = props.src;
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
	props.size || 'size-10',
	props.rounded || 'rounded-full',
	props.class
));
</script>

<div class={classes} role="img" aria-label={props.alt || props.initials || 'Avatar'} {...props}>
	{#if status === 'loaded' && props.src}
		<img src={props.src} alt={props.alt || ''} class="aspect-square h-full w-full object-cover" />
	{:else if props.fallback}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-400 font-medium">
			{@render props.fallback()}
		</div>
	{:else if props.initials}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-400 font-medium uppercase">
			{props.initials}
		</div>
	{:else}
		<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-800">
			<iconify-icon icon="mdi:account" class="size-2/3 text-surface-400/50"></iconify-icon>
		</div>
	{/if}
</div>
