<!--
@file src/components/ui/modal.svelte
@component
**SveltyCMS Modal Dialog — WCAG 3.0 Ready**

Native `<dialog>` modal with backdrop blur, zoom-in animation, configurable size,
color themes, header/footer snippet slots, and full focus management via `useDialog`.

### Props
- `open` (boolean): Bindable open state.
- `title` (string): Header title (used if no header snippet). Also sets `aria-label`.
- `size` ('sm' | 'md' | 'lg' | 'xl' | 'fullscreen'): Modal width.
- `color` ('surface' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error'): Theme.
- `header` / `footer` / `children` (Snippet): Content slots.
- `closeOnEsc` (boolean): Allow Escape to close (default: true).
- `closeOnOuterClick` (boolean): Allow backdrop click to close (default: true).
- `onopen` / `onclose` (function): Lifecycle callbacks.
- `class` (string): Additional CSS classes.

### Features:
- native `<dialog>` with backdrop blur and fade animation
- zoom-in entrance animation with spring easing
- focus trapping (Tab cycles within modal), focus restoration on close
- WCAG 3.0: aria-modal, role="dialog", aria-label, Escape key
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';
	import { useDialog } from '@utils/use-dialog.svelte.ts';

	interface Props {
		open?: boolean;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
		color?: 'surface' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';
		class?: string;
		header?: Snippet;
		footer?: Snippet;
		children?: Snippet;
		closeOnEsc?: boolean;
		closeOnOuterClick?: boolean;
		onopen?: () => void;
		onclose?: () => void;
		[key: string]: any;
	}

	let {
		open = $bindable(false),
		title,
		size = 'md',
		color = 'surface',
		class: className,
		header,
		footer,
		children,
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

	const isFullscreen = $derived(size === 'fullscreen');

	const sizeClasses: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl',
		fullscreen: 'h-full w-full rounded-none border-0',
	};

	const colorClasses: Record<string, string> = {
		surface: 'bg-surface-100 dark:bg-surface-900 border-surface-200 dark:border-surface-700',
		primary: 'bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800',
		secondary: 'bg-secondary-50 dark:bg-secondary-950 border-secondary-200 dark:border-secondary-800',
		tertiary: 'bg-tertiary-50 dark:bg-tertiary-950 border-tertiary-200 dark:border-tertiary-800',
		success: 'bg-success-50 dark:bg-success-950 border-success-200 dark:border-surface-700',
		warning: 'bg-warning-50 dark:bg-warning-950 border-warning-200 dark:border-surface-700',
		error: 'bg-error-50 dark:bg-error-950 border-error-200 dark:border-surface-700',
	};
</script>

<Portal>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<dialog
		bind:this={dialog.dialogEl}
		onclick={dialog.onBackdropClick}
		onkeydown={dialog.onKeydown}
		class={cn(
			'fixed inset-0 z-101 m-auto bg-transparent border-0 p-0 overflow-visible backdrop:bg-surface-900/60 backdrop:backdrop-blur-sm',
			'open:flex items-center justify-center p-4 sm:p-6 lg:p-8',
		)}
		{...dialog.dialogAria}
		{...rest}
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			data-dialog-content
			class={cn(
				'card shadow-2xl transition-all duration-300 transform scale-100 opacity-100',
				'flex flex-col border overflow-hidden w-full m-auto',
				sizeClasses[size],
				colorClasses[color],
				className,
			)}
			tabindex="-1"
		>
			<!-- Header -->
			{#if header || title}
				<header class="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
					{#if header}
						{@render header()}
					{:else}
						<h3 id={title ? 'modal-title' : undefined} class="h4 font-bold tracking-tight text-surface-900 dark:text-white">
							{title}
						</h3>
					{/if}

					<button
						type="button"
						onclick={() => (open = false)}
						class="p-2 rounded-full hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors"
						aria-label="Close modal"
					>
						<iconify-icon icon="mingcute:close-line" class="text-xl"></iconify-icon>
					</button>
				</header>
			{/if}

			<!-- Body -->
			<div
				data-dialog-body
				class={cn(
				'flex-1 min-h-0',
				isFullscreen ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 sm:p-6',
			)}>
				{#if children}
					{@render children()}
				{/if}
			</div>

			<!-- Footer -->
			{#if footer}
				<footer class="p-4 bg-surface-50 dark:bg-surface-900/50 border-t border-surface-200 dark:border-surface-700 flex justify-end gap-3 shrink-0">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</dialog>
</Portal>

	<style>
		dialog::backdrop {
			animation: fade-in 0.3s ease-out forwards;
		}

		/* Prevent scroll chaining — scrolling past modal bounds stays inside modal */
		dialog {
			overscroll-behavior: contain;
		}

		/* Prevent width shift when scrollbar appears in modal body */
		[data-dialog-content] [data-dialog-body] {
			scrollbar-gutter: stable;
		}

		dialog[open] > div {
			animation: zoom-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		}

		@keyframes fade-in {
			from { opacity: 0; }
			to { opacity: 1; }
		}

		@keyframes zoom-in {
			from { transform: scale(0.95); opacity: 0; }
			to { transform: scale(1); opacity: 1; }
		}

		dialog:focus {
			outline: none;
		}
	</style>
