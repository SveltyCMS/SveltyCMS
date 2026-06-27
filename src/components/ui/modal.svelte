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
- `class` (string): Additional CSS classes on the card shell.
- `dialogClass` (string): Additional CSS classes on the `<dialog>` element.
- `contentClass` (string): Additional CSS classes on the scrollable body.
- `headerClass` (string): Additional CSS classes on the header bar.

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
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'editor' | 'fullscreen';
		color?: 'surface' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';
		class?: string;
		dialogClass?: string;
		contentClass?: string;
		headerClass?: string;
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
		dialogClass,
		contentClass,
		headerClass,
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
	const isEditorShell = $derived(size === 'editor');
	const isExpandedBody = $derived(isFullscreen || isEditorShell);

	const sizeClasses: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl',
		editor:
			'w-[min(96vw,82rem)] min-w-[min(96vw,82rem)] max-w-[min(96vw,82rem)] h-[min(90dvh,52rem)] min-h-[min(90dvh,52rem)] max-h-[90dvh] max-md:w-full max-md:min-w-full max-md:max-w-none max-md:h-full max-md:min-h-full max-md:max-h-none m-auto max-md:m-0 shrink-0 max-md:shrink max-md:grow grow-0 max-md:grow overflow-hidden rounded-none border-0',
		fullscreen: 'h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-0 m-0',
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
		data-fullscreen={isFullscreen ? 'true' : undefined}
		data-editor={isEditorShell ? 'true' : undefined}
		class={cn(
			'fixed inset-0 z-101 bg-transparent border-0 backdrop:bg-surface-900/60 backdrop:backdrop-blur-sm',
			isFullscreen
				? 'open:flex m-0 h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden p-0'
				: isEditorShell
					? 'open:flex m-auto max-md:m-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:max-w-none max-md:items-stretch max-md:justify-stretch items-center justify-center overflow-hidden p-0 max-md:p-0'
					: 'open:flex m-auto items-center justify-center overflow-visible p-4 sm:p-6 lg:p-8',
			dialogClass,
		)}
		{...dialog.dialogAria}
		{...rest}
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			data-dialog-content
			class={cn(
				!isEditorShell && 'card',
				!isEditorShell && 'shadow-2xl transition-all duration-300 transform scale-100 opacity-100',
				'flex flex-col overflow-hidden',
				'w-full',
				isExpandedBody ? 'h-full min-h-0' : 'm-auto',
				sizeClasses[size],
				isEditorShell ? 'text-white border-0 ring-0 outline-none' : colorClasses[color],
				className,
			)}
			tabindex="-1"
		>
			<!-- Header -->
			{#if header || title}
				<header class={cn('flex items-center justify-between border-b border-surface-200 p-4 shrink-0 dark:border-surface-700', headerClass)}>
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
			<div class={cn(
				'flex-1 min-h-0',
				isExpandedBody ? 'flex h-full flex-col overflow-hidden p-0' : 'max-h-[80vh] overflow-y-auto p-4 sm:p-6',
				contentClass,
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

	dialog[open] > div {
		animation: zoom-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	dialog[data-fullscreen='true'][open] > div,
	dialog[data-editor='true'][open] > div {
		animation: none;
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

	:global(dialog[data-editor='true'] > [data-dialog-content]) {
		border: none !important;
		border-radius: 0 !important;
		outline: none !important;
		box-shadow: none !important;
		background-clip: border-box;
		isolation: isolate;
	}

	@media (max-width: 767px) {
		:global(dialog[data-editor='true']) {
			align-items: stretch !important;
			justify-content: stretch !important;
			inset: 0 !important;
			width: 100vw !important;
			min-width: 100vw !important;
			max-width: 100vw !important;
			height: 100dvh !important;
			max-height: 100dvh !important;
			margin: 0 !important;
			padding: 0 !important;
			background: #1a1a1a !important;
			overflow: hidden !important;
		}

		:global(dialog[data-editor='true']::backdrop) {
			background: #1a1a1a;
			backdrop-filter: none;
		}

		:global(dialog[data-editor='true'] > [data-dialog-content]) {
			width: 100% !important;
			min-width: 100% !important;
			max-width: none !important;
			height: 100dvh !important;
			min-height: 100dvh !important;
			max-height: 100dvh !important;
			margin: 0 !important;
			border-radius: 0 !important;
		}
	}
</style>
