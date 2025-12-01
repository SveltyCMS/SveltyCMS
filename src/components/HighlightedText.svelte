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

### Props
- `text` {string} - Full text to display
- `term` {string} - Term to highlight
- `charLimit` {number} - Limit before 'Show More' appears

### Features:
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

	const { text = '', term = '', charLimit = 200 }: Props = $props();

	let isExpanded = $state(false); // State for toggling 'Show More'

	// Escapes special characters in the search term
	function escapeRegex(term: string): string {
		return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// 1) Memoized regex - only recalculates when `term` changes
	const highlightingRegex = $derived(() => {
		if (!term || !term.trim()) return null;
		const escaped = escapeRegex(term);
		return new RegExp(escaped, 'gi');
	});

	// 2) Memoized segments - recalculates when term, text, charLimit or isExpanded change
	const displayTextSegments = $derived(() => {
		const shouldLimit = !isExpanded && text.length > charLimit;
		const currentText = shouldLimit ? text.slice(0, charLimit) + '...' : text;

		const regex = highlightingRegex();
		if (!regex) return [{ text: currentText, isHighlighted: false }];

		const segments: Array = [];
		let lastIndex = 0;

		currentText.replace(regex, (match, index) => {
			if (index > lastIndex) {
				segments.push({ text: currentText.slice(lastIndex, index), isHighlighted: false });
			}
			segments.push({ text: match, isHighlighted: true });
			lastIndex = index + match.length;
			return match;
		});

		if (lastIndex < currentText.length) {
			segments.push({ text: currentText.slice(lastIndex), isHighlighted: false });
		}

		return segments;
	});

	// Toggles between limited and full text
	function toggleText(): void {
		isExpanded = !isExpanded;
	}
</script>

<div role="region" aria-live="polite">
	{#each displayTextSegments() as segment, index (index)}
		{#if segment.isHighlighted}
			<mark class="bg-warning-500 px-1">{segment.text}</mark>
		{:else}
			<span>{segment.text}</span>
		{/if}
	{/each}

	{#if text.length > charLimit}
		<button
			type="button"
			onclick={toggleText}
			class="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
			aria-expanded={isExpanded}
		>
			{isExpanded ? 'Show Less' : 'Show More'}
		</button>
	{/if}
</div>
