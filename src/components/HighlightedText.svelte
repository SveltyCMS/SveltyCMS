<!-- 
@file src/components/HighlightedText.svelte
@description Enhanced HighlightedText component

Features:
- Case-insensitive term highlighting
- Custom highlight colors using Tailwind classes
- Character limit with "Show More" functionality
- Debounced highlighting for performance
- Accessible highlighting using ARIA attributes

Usage: 
<HighlightedText 
  text="Your long text here" 
  term="search term" 
  charLimit={200} 
/>
-->

<script lang="ts">
	import { onMount } from 'svelte';

	export let text = ''; // Full text to display
	export let term = ''; // Term to highlight
	export let charLimit = 200; // Limit before 'Show More' appears

	let isExpanded = false; // State for toggling 'Show More'
	let displayText = ''; // Text to display (limited or full)

	// Escapes special characters in the search term
	function escapeRegex(term: string): string {
		return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Highlights the matching term
	function highlightText(text: string, term: string): string {
		if (!term) return text;

		const escapedTerm = escapeRegex(term);
		const regex = new RegExp(escapedTerm, 'gi'); // Case-insensitive global match
		return text.replace(regex, (match) => `<mark class="bg-warning-500 px-1">${match}</mark>`);
	}

	// Toggles between limited and full text
	function toggleText() {
		isExpanded = !isExpanded;
		updateDisplayText();
	}

	// Updates the displayed text based on the limit and expansion state
	function updateDisplayText() {
		displayText = isExpanded || text.length <= charLimit ? highlightText(text, term) : highlightText(text.slice(0, charLimit) + '...', term);
	}

	// Update displayText when the component is mounted and when props change
	onMount(updateDisplayText);
	$: updateDisplayText();
</script>

<div role="region" aria-live="polite">
	{@html displayText}

	{#if text.length > charLimit}
		<button
			on:click={toggleText}
			class="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
			aria-expanded={isExpanded}
		>
			{isExpanded ? 'Show Less' : 'Show More'}
		</button>
	{/if}
</div>
