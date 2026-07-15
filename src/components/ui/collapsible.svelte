<!--
@file src/components/ui/collapsible.svelte
@component
**SveltyCMS Collapsible Primitive**

### Props
- `open` (boolean): Bindable expansion state.
- `disabled` (boolean): Disable collapse interaction.
- `trigger` (Snippet): Header/trigger content snippet.
- `children` (Snippet): Expanded panel content snippet.
- `direction` (string): Slide direction ('vertical' | 'horizontal', default: 'vertical').
- `class` (string): Additional CSS classes.

### Features:
- WCAG 3.0 compliant focus handling and ARIA expansion attributes
- Cryptographically unique ID generation for ARIA-controls mapping
- Premium smooth Svelte slide transitions
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { slide } from 'svelte/transition';
import { onMount } from 'svelte';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type Props = HTMLAttributes<HTMLDivElement> & {
	open?: boolean;
	disabled?: boolean;
	trigger: Snippet;
	children: Snippet;
	direction?: 'vertical' | 'horizontal';
	class?: string;
};

let {
	open = $bindable(false),
	disabled = false,
	trigger,
	children,
	direction = 'vertical',
	class: className,
	...rest
}: Props = $props();

let prefersReducedMotion = $state(false);

onMount(() => {
	const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
	prefersReducedMotion = mq.matches;
	const handler = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
});

const contentId = $derived(`collapsible-${crypto.randomUUID()}`);
const slideDuration = $derived(prefersReducedMotion ? 0 : 200);

function toggle() {
	if (disabled) return;
	open = !open;
}
</script>

<div class={cn('flex flex-col overflow-hidden', className)} {...rest}>
	<div
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-expanded={open}
		aria-disabled={disabled}
		aria-controls={contentId}
		onclick={toggle}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
		class={cn('select-none', disabled && 'opacity-50 cursor-not-allowed')}
	>
		{@render trigger()}
	</div>

	{#if open}
		<div
			id={contentId}
			transition:slide={{ axis: direction === 'vertical' ? 'y' : 'x', duration: slideDuration }}
			class="overflow-hidden"
		>
			<div class="p-4 pt-0">
				{@render children()}
			</div>
		</div>
	{/if}
</div>
