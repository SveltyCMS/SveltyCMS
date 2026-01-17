<!-- 
@file src/components/HighlightedText.svelte
@component
**Enhanced HighlightedText - Svelte 5 Optimized**

Intelligent text highlighting with character limits and expand/collapse functionality.

@example
<HighlightedText 
  text="Your long text here" 
  term="search term" 
  charLimit={200} 
/>

### Props
- `text` (string): Full text to display
- `term` (string): Term to highlight (supports multiple terms)
- `charLimit` (number): Character limit before 'Show More' appears
- `highlightClass` (string): Custom Tailwind class for highlights
- `caseSensitive` (boolean): Case-sensitive matching

### Features
- Smart highlighting with regex escaping
- Multiple search terms support (space-separated)
- Character limit with expand/collapse
- Custom highlight styling
- Case-sensitive/insensitive search
- ARIA accessibility
- Reduced motion support
- Performance optimized with memoization
-->

<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	interface Props {
		text?: string;
		term?: string;
		charLimit?: number;
		highlightClass?: string;
		caseSensitive?: boolean;
	}

	const {
		text = '',
		term = '',
		charLimit = 200,
		highlightClass = 'bg-warning-500 text-warning-900 dark:bg-warning-600 dark:text-warning-100',
		caseSensitive = false
	}: Props = $props();

	// State
	let isExpanded = $state(false);
	let prefersReducedMotion = $state(false);

	// Escape regex special characters
	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Build regex from multiple terms
	const highlightingRegex = $derived.by(() => {
		if (!term || !term.trim()) return null;

		// Split by whitespace and escape each term
		const terms = term.trim().split(/\s+/).filter(Boolean).map(escapeRegex);

		if (terms.length === 0) return null;

		// Create regex with all terms
		const pattern = terms.join('|');
		return new RegExp(`(${pattern})`, caseSensitive ? 'g' : 'gi');
	});

	// Determine display text (truncated or full)
	const displayText = $derived.by(() => {
		if (!text) return '';

		const shouldLimit = !isExpanded && charLimit > 0 && text.length > charLimit;
		return shouldLimit ? text.slice(0, charLimit) + '...' : text;
	});

	// Split text into segments (highlighted and normal)
	const textSegments = $derived.by(() => {
		const currentText = displayText;
		const regex = highlightingRegex;

		if (!regex || !currentText) {
			return [{ text: currentText, isHighlighted: false }];
		}

		const segments: Array<{ text: string; isHighlighted: boolean }> = [];
		let lastIndex = 0;

		// Use replace to find all matches
		currentText.replace(regex, (match, ...args) => {
			const index = args[args.length - 2]; // Second-to-last arg is the index

			// Add non-highlighted text before match
			if (index > lastIndex) {
				segments.push({
					text: currentText.slice(lastIndex, index),
					isHighlighted: false
				});
			}

			// Add highlighted match
			segments.push({
				text: match,
				isHighlighted: true
			});

			lastIndex = index + match.length;
			return match;
		});

		// Add remaining text after last match
		if (lastIndex < currentText.length) {
			segments.push({
				text: currentText.slice(lastIndex),
				isHighlighted: false
			});
		}

		return segments;
	});

	// Check if text needs truncation
	const needsTruncation = $derived(charLimit > 0 && text.length > charLimit);

	// Count highlighted matches
	const matchCount = $derived.by(() => {
		const regex = highlightingRegex;
		if (!regex || !text) return 0;

		const matches = text.match(regex);
		return matches ? matches.length : 0;
	});

	// Toggle expand/collapse
	function toggleText(): void {
		isExpanded = !isExpanded;
	}

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

<div role="region" aria-live="polite" aria-label="Text with highlights" class="inline">
	<!-- Render text segments -->
	{#each textSegments as segment, index (index)}
		{#if segment.isHighlighted}
			<mark class="rounded px-1 py-0.5 {highlightClass}" title="Highlighted match">
				{segment.text}
			</mark>
		{:else}
			<span>{segment.text}</span>
		{/if}
	{/each}

	<!-- Show More/Less button -->
	{#if needsTruncation}
		<button
			type="button"
			onclick={toggleText}
			class="ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-primary-500 transition-colors hover:bg-primary-500/10 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500"
			aria-expanded={isExpanded}
			aria-label={isExpanded ? 'Show less text' : 'Show more text'}
			transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
		>
			{isExpanded ? 'Show Less' : 'Show More'}
			<iconify-icon icon={isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="16" aria-hidden="true"></iconify-icon>
		</button>
	{/if}

	<!-- Match count indicator (if searching) -->
	{#if term && matchCount > 0}
		<span
			class="ml-2 inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-600 dark:text-primary-400"
			title="Number of matches found"
			transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
		>
			<iconify-icon icon="mdi:magnify" width="12" aria-hidden="true"></iconify-icon>
			{matchCount} match{matchCount !== 1 ? 'es' : ''}
		</span>
	{/if}

	<!-- Screen reader announcement -->
	<span class="sr-only">
		{#if term && matchCount > 0}
			{matchCount} highlighted match{matchCount !== 1 ? 'es' : ''} found.
		{/if}
		{#if needsTruncation}
			Text is {isExpanded ? 'fully expanded' : 'truncated'}. Press button to {isExpanded ? 'collapse' : 'expand'}.
		{/if}
	</span>
</div>
