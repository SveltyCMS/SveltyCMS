<!-- 
@file src/components/HighlightedText.svelte
@component
**Enhanced HighlightedText component that highlights a term in a given text**

@example
<HighlightedText 
	text="Your long text here" 
	term="search term" 
	charLimit={200} 
/>

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

	// Splits text into segments for highlighting
	function splitTextForHighlight(text: string, term: string): Array<{ text: string; isHighlighted: boolean }> {
		if (!term) return [{ text, isHighlighted: false }];

		const escapedTerm = escapeRegex(term);
		const regex = new RegExp(escapedTerm, 'gi');
		const segments: Array<{ text: string; isHighlighted: boolean }> = [];
		let lastIndex = 0;

		text.replace(regex, (match, index) => {
			if (index > lastIndex) {
				segments.push({ text: text.slice(lastIndex, index), isHighlighted: false });
			}
			segments.push({ text: match, isHighlighted: true });
			lastIndex = index + match.length;
			return match;
		});

		if (lastIndex < text.length) {
			segments.push({ text: text.slice(lastIndex), isHighlighted: false });
		}

		return segments;
	}

	// Toggles between limited and full text
	function toggleText() {
		isExpanded = !isExpanded;
	}

	// Compute displayText and segments based on text, term, charLimit, and isExpanded
	let displayText = $state([] as Array<{ text: string; isHighlighted: boolean }>);

	$effect(() => {
		const shouldLimit = !isExpanded && text.length > charLimit;
		const limitedText = shouldLimit ? text.slice(0, charLimit) + '...' : text;
		displayText = splitTextForHighlight(limitedText, term);
	});
</script>

<div role="region" aria-live="polite">
	{#each displayText as segment}
		{#if segment.isHighlighted}
			<mark class="bg-warning-500 px-1">{segment.text}</mark>
		{:else}
			<span>{segment.text}</span>
		{/if}
	{/each}

	{#if text.length > charLimit}
		<button onclick={toggleText} class="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500" aria-expanded={isExpanded}>
			{isExpanded ? 'Show Less' : 'Show More'}
		</button>
	{/if}
</div>
