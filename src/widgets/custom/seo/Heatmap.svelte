<!-- 
@file src/widgets/seo/Heatmap.svelte
@component
**Heatmap widget for SEO Widget to manage meta title, description, and robots meta tags**

@example
<Heatmap content={title + ' ' + description} language={$contentLanguage} keywords={seoKeywords} on:heatmapGenerated={handleHeatmapGenerated} />

#### Props
- `content` {string} - Content text
- `language` {string} - Content language
- `keywords` {string[]} - Array of keywords
- `on:heatmapGenerated` {function} - Heatmap data handler

#### Features
- Translatable
-->

<script lang="ts">
	import { fade } from 'svelte/transition';
	import { tick } from 'svelte';

	interface HeatmapData {
		heatmapData: Array<{ word: string; heatLevel: number; isKeyword: boolean }>;
		keywordDensity: Record<string, number>;
	}

	interface Props {
		content?: string;
		language?: string;
		keywords?: string[];
		'on:heatmapGenerated'?: (data: HeatmapData) => void;
	}

	// Props with default values
	let { content = '', language = 'en', keywords = [], 'on:heatmapGenerated': onHeatmapGenerated = () => {} }: Props = $props();

	let heatmapData = $state<Array<{ word: string; heatLevel: number; isKeyword: boolean }>>([]);
	let keywordDensity = $state<Record<string, number>>({});
	let debounceTimer = $state<number | undefined>();

	async function generateHeatmap() {
		if (!content) {
			heatmapData = [];
			keywordDensity = {};
			onHeatmapGenerated({ heatmapData, keywordDensity });
			return;
		}

		const words = content.split(/\s+/);

		heatmapData = words.map((word, index) => ({
			word,
			heatLevel: calculateHeatLevel(word, index, words.length, language),
			isKeyword: keywords.includes(word.toLowerCase())
		}));

		analyzeKeywordDensity(words);
		onHeatmapGenerated({ heatmapData, keywordDensity });
		await tick();
	}

	function calculateHeatLevel(word: string, index: number, totalWords: number, lang: string): number {
		let score = 0;

		// Position-based scoring
		const positionFactor = 1 - index / totalWords;
		score += positionFactor * 2;

		// Word length scoring (adjust for different languages)
		const idealLength = lang === 'en' ? 5 : 6;
		score += Math.max(0, 3 - Math.abs(word.length - idealLength));

		// Keyword bonus
		if (keywords.includes(word.toLowerCase())) {
			score += 2;
		}

		// Normalize score to 1-5 range
		return Math.max(1, Math.min(5, Math.round(score)));
	}

	function analyzeKeywordDensity(words: string[]) {
		const totalWords = words.length;
		const result: Record<string, number> = {};

		for (const keyword of keywords) {
			const count = words.filter((word) => word.toLowerCase() === keyword.toLowerCase()).length;
			result[keyword] = (count / totalWords) * 100;
		}

		keywordDensity = result;
	}

	// Effect to handle content changes with debounce
	$effect.root(() => {
		clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			generateHeatmap();
		}, 300);
	});
</script>

<div class="heatmap-content">
	{#if heatmapData.length > 0}
		{#each heatmapData as { word, heatLevel, isKeyword }}
			<span
				class="heat-{heatLevel} {isKeyword ? 'keyword' : ''}"
				tabindex="0"
				role="textbox"
				aria-label="Heat level {heatLevel}: {word}{isKeyword ? ', keyword' : ''}"
				data-tooltip="Heat: {heatLevel}, {isKeyword ? 'Keyword' : 'Regular word'}"
				transition:fade={{ duration: 200 }}>{word}</span
			>
		{/each}
	{:else}
		<p>No content available for heatmap.</p>
	{/if}
</div>

<div class="keyword-density">
	<h4>Keyword Density</h4>
	{#if Object.keys(keywordDensity).length > 0}
		<ul>
			{#each Object.entries(keywordDensity) as [keyword, density]}
				<li>{keyword}: {density.toFixed(2)}%</li>
			{/each}
		</ul>
	{:else}
		<p>No keywords provided or no matching keywords found in content.</p>
	{/if}
</div>

<style lang="postcss">
	.heatmap-content {
		line-height: 1.5;
		word-wrap: break-word;
		font-size: 16px;
	}
	:global(.heat-1) {
		background-color: rgba(0, 255, 0, 0.2);
	}
	:global(.heat-2) {
		background-color: rgba(255, 255, 0, 0.2);
	}
	:global(.heat-3) {
		background-color: rgba(255, 165, 0, 0.2);
	}
	:global(.heat-4) {
		background-color: rgba(255, 0, 0, 0.2);
	}
	:global(.heat-5) {
		background-color: rgba(128, 0, 128, 0.2);
	}
	:global(.keyword) {
		border-bottom: 2px solid blue;
	}

	[data-tooltip] {
		position: relative;
		cursor: help;
	}
	[data-tooltip]:hover::after {
		content: attr(data-tooltip);
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		background-color: #333;
		color: white;
		padding: 5px;
		border-radius: 3px;
		font-size: 12px;
		white-space: nowrap;
	}

	.keyword-density {
		margin-top: 20px;
		font-size: 14px;
	}

	@media (max-width: 600px) {
		.heatmap-content {
			font-size: 14px;
			line-height: 1.3;
		}
		.keyword-density {
			font-size: 12px;
		}
	}
</style>
