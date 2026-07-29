<!--
@file src/components/ui/drawer.svelte
@component
**SveltyCMS Drawer — WCAG 3.0 Ready**

Slide-out panel using native `<dialog>` with backdrop blur, fly transition,
configurable position, and full focus management via `useDialog`.

### Props
- `open` (boolean): Bindable open state.
- `position` ('left' | 'right' | 'top' | 'bottom'): Slide direction (default: 'right').
- `size` (string): CSS width/height override.
- `color` ('surface' | 'primary' | 'secondary' | 'tertiary'): Background theme.
- `title` (string): Header title. Also sets `aria-label`.
- `class` (string): Additional CSS classes.
- `children` / `footer` (Snippet): Content slots.
- `closeOnEsc` (boolean): Allow Escape to close (default: true).
- `closeOnOuterClick` (boolean): Allow backdrop click to close (default: true).
- `onopen` / `onclose` (function): Lifecycle callbacks.

### Features:
- native `<dialog>` with backdrop blur and fade animation
- fly transition matching slide direction
- focus trapping (Tab cycles within drawer), focus restoration on close
- WCAG 3.0: aria-modal, role="dialog", aria-label, Escape key
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';
	import { fly } from 'svelte/transition';
	import { useDialog } from '@utils/use-dialog.svelte.ts';

	interface Props {
		open?: boolean;
		position?: 'left' | 'right' | 'top' | 'bottom';
		size?: string;
		color?: 'surface' | 'primary' | 'secondary' | 'tertiary';
		title?: string;
		class?: string;
		children?: Snippet;
		footer?: Snippet;
		closeOnEsc?: boolean;
		closeOnOuterClick?: boolean;
		onopen?: () => void;
		onclose?: () => void;
		[key: string]: any;
	}

	let {
		open = $bindable(false),
		position = 'right',
		size,
		color = 'surface',
		title,
		class: className,
		children,
		footer,
		closeOnEsc = true,
		closeOnOuterClick = true,
		onopen,
		onclose,
		...rest
	}: Props = $props();

	const dialog = useDialog({
		open: () => open,
		onClose: () => (open = false),
		ariaLabel: () => title,
		closeOnEsc: () => closeOnEsc,
		closeOnOuterClick: () => closeOnOuterClick,
		// svelte-ignore state_referenced_locally
		onopen,
		// svelte-ignore state_referenced_locally
		onclose,
	});

	const positionClasses: Record<string, string> = {
		left: 'left-0 right-auto h-full w-80',
		right: 'right-0 left-auto h-full w-80',
		top: 'top-0 bottom-auto w-full h-80',
		bottom: 'bottom-0 top-auto w-full h-80',
	};

	const flyParams = $derived.by(() => {
		switch (position) {
			case 'left': return { x: -320, duration: 300 };
			case 'right': return { x: 320, duration: 300 };
			case 'top': return { y: -320, duration: 300 };
			case 'bottom': return { y: 320, duration: 300 };
			default: return { x: 320, duration: 300 };
		}
	});

	const colorClasses: Record<string, string> = {
		surface: 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800',
		primary: 'bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800',
		secondary: 'bg-secondary-50 dark:bg-secondary-950 border-secondary-200 dark:border-secondary-800',
		tertiary: 'bg-tertiary-50 dark:bg-tertiary-950 border-tertiary-200 dark:border-tertiary-800',
	};
</script>

<Portal>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<dialog
		bind:this={dialog.dialogEl}
		onclick={dialog.onBackdropClick}
		onkeydown={dialog.onKeydown}
		class={cn(
			'fixed inset-0 z-101 bg-transparent border-0 p-0 overflow-hidden backdrop:bg-surface-900/60 backdrop:backdrop-blur-sm',
			'open:flex flex-col',
		)}
		{...dialog.dialogAria}
		aria-modal="true"
		{...rest}
	>
		{#if open}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				data-dialog-content
				class={cn(
					'fixed z-102 flex flex-col border-s dark:border-surface-800 shadow-2xl transition-all duration-300',
					colorClasses[color],
					positionClasses[position],
					size,
					className,
				)}
				transition:fly={flyParams}
				tabindex="-1"
			>
				<!-- Header -->
				<header class="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-800 shrink-0">
					<div>
						{#if title}
							<h3 class="text-lg font-bold text-surface-900 dark:text-white">{title}</h3>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => (open = false)}
						class="p-2 rounded-full hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
						aria-label="Close drawer"
					>
						<iconify-icon icon="mingcute:close-line" class="text-xl"></iconify-icon>
					</button>
				</header>

				<!-- Body -->
				<div class="flex-1 overflow-y-auto p-4 sm:p-6">
					{#if children}
						{@render children()}
					{/if}
				</div>

				<!-- Footer -->
				{#if footer}
					<footer class="p-4 bg-surface-50 dark:bg-surface-950/50 border-t border-surface-200 dark:border-surface-800 flex justify-end gap-3 shrink-0">
						{@render footer()}
					</footer>
				{/if}
			</div>
		{/if}
	</dialog>
</Portal>

<style>
	dialog::backdrop {
		animation: fade-in 0.3s ease-out forwards;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	dialog:focus {
		outline: none;
	}
</style>
