<!-- 
@file src/components/system/AccessibilityHelp.svelte
@component
**A modal dialog displaying accessibility features and keyboard shortcuts (ATAG)**
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionReturn } from 'svelte/action';

	interface Props {
		close?: () => void;
		onRequestFeedback?: () => void;
	}

	const { close, onRequestFeedback }: Props = $props();
	let dialogRef = $state<HTMLDivElement | null>(null);
	let previousFocus: HTMLElement | null = null;

	// Keyboard shortcuts with application-specific ones
	const shortcuts = [
		// Application-specific (ATAG requirement)
		{ key: '?', desc: 'Open this accessibility help dialog' },
		{ key: 'Ctrl/Cmd + S', desc: 'Save current content' },
		{ key: 'Alt + 1-5', desc: 'Jump to setup wizard steps 1-5' },
		{ key: 'Alt + T', desc: 'Toggle theme (light/dark)' },

		// Navigation
		{ key: 'Tab', desc: 'Navigate forward through interactive elements' },
		{ key: 'Shift + Tab', desc: 'Navigate backward' },
		{ key: 'Enter / Space', desc: 'Activate buttons and controls' },
		{ key: 'Escape', desc: 'Close dialogs and clear selections' },
		{ key: 'Arrow Keys', desc: 'Navigate within components' }
	];

	// Focus Trap Action
	function focusTrap(node: HTMLElement): ActionReturn {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Tab') {
				const focusableElements = node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
				const firstElement = focusableElements[0] as HTMLElement;
				const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

				if (e.shiftKey && document.activeElement === firstElement) {
					e.preventDefault();
					lastElement.focus();
				} else if (!e.shiftKey && document.activeElement === lastElement) {
					e.preventDefault();
					firstElement.focus();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				close?.();
			}
		};

		node.addEventListener('keydown', handleKeyDown);
		return {
			destroy() {
				node.removeEventListener('keydown', handleKeyDown);
			}
		};
	}

	// Restore focus on unmount
	onMount(() => {
		previousFocus = document.activeElement as HTMLElement;
		dialogRef?.focus();

		return () => {
			previousFocus?.focus();
		};
	});
</script>

<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="a11y-dialog-title"
	aria-describedby="a11y-dialog-desc"
	class="max-h-[80vh] cursor-auto space-y-6 overflow-y-auto p-4 sm:p-6"
	bind:this={dialogRef}
	use:focusTrap
	tabindex="-1"
>
	<h2 id="a11y-dialog-title" class="sr-only">Accessibility Help</h2>
	<p id="a11y-dialog-desc" class="sr-only">Information about keyboard shortcuts, screen reader support, and accessibility features in SveltyCMS</p>

	<!-- Header -->
	<div class="flex items-center justify-between border-b border-surface-200 pb-4 dark:border-surface-700">
		<div>
			<h3 class="h3 flex items-center gap-2 font-bold">
				<iconify-icon icon="mdi:accessibility" width="24" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
				Accessibility Help
			</h3>
			<p class="text-sm text-surface-500">WCAG 2.2 AA & ATAG 2.0 Compliance</p>
		</div>
		<button onclick={close} class="btn-icon rounded-full" aria-label="Close accessibility help dialog">
			<iconify-icon icon="mdi:close" width="20"></iconify-icon>
		</button>
	</div>

	<!-- Introduction -->
	<section aria-labelledby="intro-heading" class="space-y-3">
		<h4 id="intro-heading" class="h4 font-semibold dark:text-white">About Accessibility in SveltyCMS</h4>
		<p class="text-surface-600 dark:text-surface-300">
			SveltyCMS is designed to meet <strong>WCAG 2.2 Level AA</strong> for the user interface and
			<strong>ATAG 2.0 Level AA</strong> as an authoring tool. This ensures both the CMS interface and the content it produces are accessible to all users.
		</p>
	</section>

	<!-- Keyboard Shortcuts -->
	<section aria-labelledby="keyboard-heading" class="space-y-3">
		<h4 id="keyboard-heading" class="h4 flex items-center gap-2 font-semibold dark:text-white">
			<iconify-icon icon="mdi:keyboard" width="20" aria-hidden="true"></iconify-icon>
			Keyboard Shortcuts
		</h4>

		<div class="overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
			<table class="w-full text-sm" aria-describedby="keyboard-table-desc">
				<caption id="keyboard-table-desc" class="sr-only"> Keyboard shortcuts available in SveltyCMS </caption>
				<thead class="bg-surface-100 dark:bg-surface-800">
					<tr>
						<th scope="col" class="px-4 py-3 text-left font-semibold dark:text-white">Key / Combination</th>
						<th scope="col" class="px-4 py-3 text-left font-semibold dark:text-white">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-200 dark:divide-surface-700">
					{#each shortcuts as { key, desc }, i (i)}
						<tr class="hover:bg-surface-50 dark:hover:bg-surface-800/50">
							<td class="px-4 py-3">
								<kbd class="inline-flex items-center rounded bg-surface-200 px-2 py-1 font-mono text-xs dark:bg-surface-700 dark:text-white">
									{key}
								</kbd>
							</td>
							<td class="px-4 py-3 text-surface-600 dark:text-surface-300">{desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="text-xs text-surface-500">
			Tip: Press <kbd class="inline-flex items-center rounded bg-surface-200 px-2 py-1 font-mono text-xs dark:bg-surface-700 dark:text-white">?</kbd> anywhere
			in the application to reopen this help.
		</p>
	</section>

	<!-- ATAG Compliance -->
	<section aria-labelledby="atag-heading" class="space-y-3">
		<h4 id="atag-heading" class="h4 flex items-center gap-2 font-semibold dark:text-white">
			<iconify-icon icon="mdi:shield-check" width="20" aria-hidden="true"></iconify-icon>
			ATAG 2.0 Compliance
		</h4>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
				<h5 class="mb-2 font-semibold text-primary-800 dark:text-primary-200">Part A: Accessible Interface</h5>
				<ul class="space-y-1 text-sm text-primary-700 dark:text-primary-300">
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Full keyboard navigation</span>
					</li>
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Screen reader compatible</span>
					</li>
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Sufficient color contrast</span>
					</li>
				</ul>
			</div>

			<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
				<h5 class="mb-2 font-semibold text-emerald-800 dark:text-emerald-200">Part B: Accessible Content</h5>
				<ul class="space-y-1 text-sm text-emerald-700 dark:text-emerald-300">
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Alt text enforcement for images</span>
					</li>
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Semantic heading structure</span>
					</li>
					<li class="flex items-start gap-2">
						<iconify-icon icon="mdi:check-circle" class="mt-0.5" width="16"></iconify-icon>
						<span>Accessible table creation</span>
					</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Accessibility Statement Link -->
	<div class="border-t border-surface-200 pt-4 dark:border-surface-700">
		<a
			href="/accessibility-statement"
			class="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 underline-offset-4 hover:underline"
			onclick={() => {
				// Let default navigation happen, but close dialog if needed
				if (close) close();
			}}
		>
			View full accessibility statement →
		</a>
	</div>

	<!-- Footer Actions -->
	<div class="flex justify-between pt-2">
		<button
			onclick={() => {
				if (onRequestFeedback) onRequestFeedback();
				if (close) close();
			}}
			class="btn preset-outlined"
		>
			<iconify-icon icon="mdi:message-text" width="16" class="mr-2"></iconify-icon>
			Give Feedback
		</button>
		<button onclick={close} class="btn preset-filled-primary-500"> Close Dialog </button>
	</div>
</div>
