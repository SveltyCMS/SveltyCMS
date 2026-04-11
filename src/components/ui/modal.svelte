<!-- 
 @src/routes/api/cms.ts src/components/ui/modal.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Modal Primitive
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';

	interface Props {
		open?: boolean;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
		color?: 'surface' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';
		class?: string;
		header?: Snippet;
		footer?: Snippet;
		children?: Snippet;
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
		...rest 
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (open) {
			dialogEl?.showModal();
			document.body.style.overflow = 'hidden';
		} else {
			dialogEl?.close();
			document.body.style.overflow = '';
		}
	});

	const isFullscreen = $derived(size === 'fullscreen');

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl',
		fullscreen: 'h-full w-full rounded-none border-0'
	};

	const colorClasses = {
		surface: 'bg-surface-100 dark:bg-surface-900 border-surface-200 dark:border-surface-800',
		primary: 'bg-primary-50 dark:bg-primary-950 border-primary-200 dark:border-primary-800',
		secondary: 'bg-secondary-50 dark:bg-secondary-950 border-secondary-200 dark:border-secondary-800',
		tertiary: 'bg-tertiary-50 dark:bg-tertiary-950 border-tertiary-200 dark:border-tertiary-800',
		success: 'bg-success-50 dark:bg-success-950 border-success-200 dark:border-surface-800',
		warning: 'bg-warning-50 dark:bg-warning-950 border-warning-200 dark:border-surface-800',
		error: 'bg-error-50 dark:bg-error-950 border-error-200 dark:border-surface-800'
	};

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === dialogEl) {
			open = false;
		}
	}

	function handleClose() {
		open = false;
	}
</script>

<Portal>
	<dialog
		bind:this={dialogEl}
		onclose={handleClose}
		onclick={handleBackdropClick}
		class={cn(
			'fixed inset-0 z-101 m-auto bg-transparent border-0 p-0 overflow-visible backdrop:bg-surface-900/60 backdrop:backdrop-blur-sm',
			'open:flex items-center justify-center p-4 sm:p-6 lg:p-8'
		)}
		{...rest}
	>
		<div
			class={cn(
				'card shadow-2xl transition-all duration-300 transform scale-100 opacity-100',
				'flex flex-col border overflow-hidden w-full m-auto',
				sizeClasses[size],
				colorClasses[color],
				className
			)}
		>
			<!-- Header -->
			{#if header || title}
				<header class="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-800 shrink-0">
					{#if header}
						{@render header()}
					{:else}
						<h3 class="h4 font-bold tracking-tight text-surface-900 dark:text-white">
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
				'flex-1 overflow-y-auto p-4 sm:p-6',
				isFullscreen ? 'h-full' : 'max-h-[80vh]'
			)}>
				{#if children}
					{@render children()}
				{/if}
			</div>

			<!-- Footer -->
			{#if footer}
				<footer class="p-4 bg-surface-50 dark:bg-surface-900/50 border-t border-surface-200 dark:border-surface-800 flex justify-end gap-3 shrink-0">
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

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes zoom-in {
		from { transform: scale(0.95); opacity: 0; }
		to { transform: scale(1); opacity: 1; }
	}

	/* Disable default focus ring on dialog */
	dialog:focus {
		outline: none;
	}
</style>
