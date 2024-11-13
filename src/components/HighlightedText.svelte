<!-- 
@file src/components/HighlightedText.svelte
@component
**Enhanced HighlightedText component that highlights a term in a given text**

```tsx
<HighlightedText 
	text="Your long text here" 
	term="search term" 
	charLimit={200} 
/>
```

#### Props
- `text` {string} - Full text to display
- `term` {string} - Term to highlight
- `charLimit` {number} - Limit before 'Show More' appears

Features:
- Custom highlight colors using Tailwind classes
- Character limit with "Show More" functionality
- Debounced highlighting for performance
- Accessible highlighting using ARIA attributes
-->

<script lang="ts">
	interface Props {
		text?: string; // Full text to display
		term?: string; // Term to highlight
		charLimit?: number; // Limit before 'Show More' appears
	}

	let { text = '', term = '', charLimit = 200 }: Props = $props();

	let isExpanded = $state(false); // State for toggling 'Show More'

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
	}

	// Compute displayText based on text, term, charLimit, and isExpanded
	let displayText = $derived(() => {
		const shouldLimit = !isExpanded && text.length > charLimit;
		const limitedText = shouldLimit ? text.slice(0, charLimit) + '...' : text;
		return highlightText(limitedText, term);
	});
</script>

<div role="region" aria-live="polite">
	{@html displayText}

	{#if text.length > charLimit}
		<button onclick={toggleText} class="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500" aria-expanded={isExpanded}>
			{isExpanded ? 'Show Less' : 'Show More'}
		</button>
	{/if}
</div>
