<!-- 
 @src/routes/api/cms.ts src/components/ui/popover.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Popover Primitive
-->

<script lang="ts">
	import { computePosition, autoUpdate, offset, flip, shift, arrow as floatArrow, type Placement } from '@floating-ui/dom';
	import { cn } from '@utils/cn';
	import { onMount, onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';

	interface Props {
		open?: boolean;
		position?: Placement;
		arrow?: boolean;
		class?: string;
		trigger?: Snippet;
		children?: Snippet;
		[key: string]: any;
	}

	let { 
		open = $bindable(false),
		position = 'bottom', 
		arrow = true, 
		class: className,
		trigger, 
		children,
		...rest 
	}: Props = $props();

	let referenceEl = $state<HTMLElement | null>(null);
	let floatingEl = $state<HTMLElement | null>(null);
	let arrowEl = $state<HTMLElement | null>(null);

	let x = $state(0);
	let y = $state(0);
	let actualPlacement = $state<string>('bottom');
	let arrowX = $state<number | undefined>(0);
	let arrowY = $state<number | undefined>(0);

	$effect(() => {
		if (open && referenceEl && floatingEl) {
			const cleanup = autoUpdate(referenceEl, floatingEl, async () => {
				const { x: nextX, y: nextY, placement: finalPlacement, middlewareData } = await computePosition(referenceEl!, floatingEl!, {
					placement: position,
					middleware: [
						offset(12),
						flip(),
						shift({ padding: 10 }),
						arrow && floatArrow({ element: arrowEl! })
					].filter(Boolean) as any
				});

				x = nextX;
				y = nextY;
				actualPlacement = finalPlacement;
				
				if (arrow) {
					const { x: ax, y: ay } = middlewareData.arrow || {};
					arrowX = ax;
					arrowY = ay;
				}
			});

			return cleanup;
		}
	});

	// Handle click outside
	function handleClickOutside(event: MouseEvent) {
		if (open && referenceEl && floatingEl && 
			!referenceEl.contains(event.target as Node) && 
			!floatingEl.contains(event.target as Node)) {
			open = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}
	});

	const staticSide = $derived({
		top: 'bottom',
		right: 'left',
		bottom: 'top',
		left: 'right'
	}[actualPlacement.split('-')[0]] as string);
</script>

<div 
	bind:this={referenceEl}
	class="inline-block"
	onclick={(e) => { e.stopPropagation(); open = !open; }}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (open = !open)}
	role="button"
	tabindex="0"
	{...rest}
>
	{#if trigger}
		{@render trigger()}
	{/if}
</div>

{#if open}
	<Portal>
		<div
			bind:this={floatingEl}
			class={cn(
				'z-200 card p-4 shadow-xl border border-surface-200 dark:border-surface-800 bg-surface-100/90 dark:bg-surface-900/90 backdrop-blur-md absolute',
				'transition-all duration-200 animate-in fade-in zoom-in-95',
				className
			)}
			style="left: {x}px; top: {y}px;"
		>
			{#if arrow}
				<div
					bind:this={arrowEl}
					class="absolute size-3 bg-surface-100 dark:bg-surface-900 border-l border-t border-surface-200 dark:border-surface-800 rotate-45"
					style="
						left: {arrowX != null ? `${arrowX}px` : ''};
						top: {arrowY != null ? `${arrowY}px` : ''};
						{staticSide}: -6px;
					"
				></div>
			{/if}
			
			{#if children}
				{@render children()}
			{/if}
		</div>
	</Portal>
{/if}
